/**
 * Gameplay-level aircraft: systems, weapons state, airframe health, runway
 * handling and terrain collision. It composes the pure FlightModel; it knows
 * nothing about Three.js or rendering.
 */
import { FlightModel } from './FlightModel.js';
import { getAtmosphere } from './Atmosphere.js';
import { clamp, quaternionFromAttitude, moveTowards, smoothstep, DEG } from './math.js';

const G0 = 9.80665;
export const CONTACT_HEIGHT = 2.04;

export class Aircraft {
  constructor(config, {
    isPlayer = false, team = 'blue', callsign = 'FALCON', selfDamage = true,
  } = {}) {
    this.config = config;
    this.contactHeight=config.systems.contactHeight??CONTACT_HEIGHT;
    this.isPlayer = isPlayer;
    // Player aircraft do not randomly damage their own engine/airframe from
    // over-speed or over-G. Combat damage and terrain impact still apply.
    this.selfDamage = selfDamage;
    this.team = team;
    this.callsign = callsign;
    this.flight = new FlightModel(config);
    this.systems = {
      gear: 0, gearTarget: 0,
      flaps: 0, flapTarget: 0,
      airbrake: 0, airbrakeTarget: 0,
      canopy: 0, canopyTarget: 0,
      stores: 1,
      parachute:0,fuelDump:false,
    };
    this.weapons = {
      ammo: config.armament.cannon.ammo,
      missiles: 0,
      flares: config.armament.flare.count,
      chaff: config.systems.chaffCount +
        (config.armament.chaffPods || 0) * (config.armament.chaffPerPod || 0),
    };
    this._initMissileLoadout();
    this.throttleTarget = 0.85;
    this.datalinkTarget = null;
    this.health = 100;
    this.alive = true;
    this.onGround = false;
    this.groundSpeed = 0;
    this.groundHeading = 0;
    this.groundPitch = 0;
    this.takeoffPitchAssist = 0;
    this.lastAttacker = null;
    this.lastDamageTime = -99;
    this.events = [];
    this.overLimitTime = 0;
    this.overSpeedTime = 0;
    this.takeoffGuard = 0;
    this.groundedLockout = 0;
    this.flareCooldown = 0;
    this.chaffCooldown = 0;
    this.missileCooldown = 0;
    this.gunFire = false;
    this._gunSpinTime = 0;
    this.time = 0;
    this.spawn = null;
    this.ai = null;
    this.takeoffAuto = false;
    this.takeoffTimer = 0;
  }

  _initMissileLoadout() {
    const base = this.config.armament.missiles;
    const source = this.config.armament.missileLoadout || [{
      ...base, type: base.type || 'aim9',
    }];
    this.weapons.missileLoadout = source.map((m) => ({ ...m, remaining: m.count }));
    this.weapons.selectedMissile = 0;
    this.weapons.missiles = source.reduce((sum, m) => sum + m.count, 0);
    this.weapons.jettisonedStations = {};
    // Drop-tank fuel per station (kg), full at spawn; drawn by _feedExternalFuel().
    this.weapons.tankFuel = Object.fromEntries((this.config.armament.externalTanks || []).map((t) => [t.station, t.fuel || 0]));
    this._fedFuel = null;
    this._syncMissileRemaining();
  }

  /** Fuel left in the attached drop tanks (kg). */
  get externalFuel() {
    let sum = 0;
    for (const t of this.config.armament.externalTanks || []) if (!this.weapons.jettisonedStations[t.station]) sum += this.weapons.tankFuel?.[t.station] || 0;
    return sum;
  }

  // Drop tanks feed first: top the internal tanks back up by what was used since
  // the last call, drawing evenly from the attached tanks. The fuel leaves the
  // stores mass (it was counted there as part of each full tank).
  _feedExternalFuel() {
    const ext = this.externalFuel, used = this._fedFuel == null ? 0 : Math.max(0, this._fedFuel - this.flight.fuel);
    if (ext > 0 && used > 0) {
      const moved = Math.min(used, ext), keep = 1 - moved / ext;
      for (const t of this.config.armament.externalTanks || []) if (!this.weapons.jettisonedStations[t.station]) this.weapons.tankFuel[t.station] *= keep;
      this.flight.fuel += moved; this.flight.storesMass -= moved; this._refreshMass();
    }
    this._fedFuel = this.flight.fuel;
  }

  // Stores mass for drag: an empty drop tank drags like a full one, so add back
  // the fuel already drawn from tanks that are still attached.
  _storeDragMass() {
    let drawn = 0;
    for (const t of this.config.armament.externalTanks || []) if (!this.weapons.jettisonedStations[t.station]) drawn += (t.fuel || 0) - (this.weapons.tankFuel?.[t.station] ?? (t.fuel || 0));
    return this.flight.storesMass + drawn;
  }

  _syncMissileRemaining() {
    const remaining = {};
    for (const m of this.weapons.missileLoadout || []) {
      const key = m.type;
      remaining[key] = (remaining[key] || 0) + Math.max(0, m.remaining);
    }
    this.weapons.missileRemaining = remaining;
  }

  getSelectedMissileSlot() {
    const loadout = this.weapons.missileLoadout || [];
    const slot = loadout[this.weapons.selectedMissile];
    if (slot && slot.remaining > 0) return slot;
    const next = loadout.findIndex((m) => m.remaining > 0);
    if (next < 0) return null;
    this.weapons.selectedMissile = next;
    return loadout[next];
  }

  getMissileConfig() {
    return this.getSelectedMissileSlot() || this.config.armament.missiles;
  }

  cycleMissile() {
    const loadout = this.weapons.missileLoadout || [];
    if (!loadout.length) return null;
    for (let i = 1; i <= loadout.length; i++) {
      const idx = (this.weapons.selectedMissile + i) % loadout.length;
      if (loadout[idx].remaining > 0) {
        this.weapons.selectedMissile = idx;
        return loadout[idx];
      }
    }
    return null;
  }

  reset(spawn, { onGround = false } = {}) {
    this.spawn = { ...spawn };
    this.onGround = onGround;
    this.health = 100;
    this.alive = true;
    this.events = [];
    this.overLimitTime = 0;
    this.overSpeedTime = 0;
    this.takeoffGuard = 0;
    this.groundedLockout = 0;
    this.flareCooldown = 0;
    this.chaffCooldown = 0;
    this.missileCooldown = 0;
    this.gunFire = false;
    this.takeoffAuto = false;
    this.takeoffTimer = 0;
    this.lastAttacker = null;
    this.datalinkTarget = null;
    this.time = 0;
    this.weapons.ammo = this.config.armament.cannon.ammo;
    this._gunAccumulator = 0;
    this._shotCounter = 0;
    this._gunSpinTime = 0;
    this._initMissileLoadout();
    this.weapons.flares = this.config.armament.flare.count;
    this.weapons.chaff = this.config.systems.chaffCount +
      (this.config.armament.chaffPods || 0) *
      (this.config.armament.chaffPerPod || 0);
    this.systems.gear = onGround ? 1 : 0;
    this.systems.gearTarget = onGround ? 1 : 0;
    this.systems.flaps = onGround ? 0.6 : 0;
    this.systems.flapTarget = onGround ? 0.6 : 0;
    this.systems.airbrake = 0;
    this.systems.airbrakeTarget = 0;
    this.systems.canopy = 0;
    this.systems.canopyTarget = 0;
    this.systems.stores = 1;
    this.systems.parachute=0;this.systems.fuelDump=false;
    this.groundSpeed = 0;
    this.groundHeading = (spawn.heading || 0) * DEG;
    this.groundPitch = 0;
    this.takeoffPitchAssist = 0;
    this.throttleTarget = onGround ? 0 : (spawn.throttle ?? 0.86);
    this.flight.reset({
      x: spawn.x, y: onGround?(spawn.y+(this.contactHeight-CONTACT_HEIGHT)):spawn.y, z: spawn.z,
      heading: (spawn.heading || 0) * DEG,
      speed: onGround ? 0 : (spawn.speed ?? 220),
      throttle: this.throttleTarget,
      gear: this.systems.gear,
      flaps: this.systems.flaps,
    });
    if (onGround) {
      this.flight.velocity.set(0, 0, 0);
      this.flight.rates.p = this.flight.rates.q = this.flight.rates.r = 0;
    }
  }

  toggleGear() {
    if (!this.alive) return;
    if (this.onGround && this.systems.gearTarget > 0.5) return;
    this.systems.gearTarget = this.systems.gearTarget > 0.5 ? 0 : 1;
  }

  toggleFlaps() {
    if (!this.alive) return;
    // F is the landing-flap / clean selector.
    this.systems.flapTarget = this.systems.flapTarget > 0.5 ? 0 : 1;
  }

  setTakeoffFlaps() {
    if (!this.alive) return;
    this.systems.flapTarget = 0.6;
  }

  toggleAirbrake() {
    if (!this.alive) return;
    this.systems.airbrakeTarget = this.systems.airbrakeTarget > 0.5 ? 0 : 1;
  }

  toggleCanopy() {
    if (!this.alive) return;
    this.systems.canopyTarget = this.systems.canopyTarget > 0.5 ? 0 : 1;
  }

  setThrottle(value) {
    this.throttleTarget = clamp(value, 0, 1.1);
  }

  get speedKmh() {
    return this.flight.iasKmh;
  }

  getAltitudeAgl(world) {
    return this.flight.position.y - world.groundHeight(
      this.flight.position.x, this.flight.position.z);
  }

  get damageSeverity() {
    return clamp(1 - this.health / 100, 0, 1);
  }

  update(dt, inputs, world) {
    if (!this.alive) return;
    this.time += dt;
    this.takeoffGuard = Math.max(0, this.takeoffGuard - dt);
    this.groundedLockout = Math.max(0, this.groundedLockout - dt);
    this.flareCooldown = Math.max(0, this.flareCooldown - dt);
    this.chaffCooldown = Math.max(0, this.chaffCooldown - dt);
    this.missileCooldown = Math.max(0, this.missileCooldown - dt);
    this.throttleTarget = clamp(inputs.throttle ?? this.throttleTarget, 0, 1.1);
    this._updateSystems(dt);
    this._feedExternalFuel();
    this.systems.stores = this.config.armament.trackStoreMass?Math.min(1,this._storeDragMass()/Math.max(1,this.config.mass.stores)):Math.min(1, 0.25 + 0.75 *
      (this.weapons.missiles / this.config.armament.missiles.count));
    if(this.systems.fuelDump){this.flight.fuel=Math.max(0,this.flight.fuel-(this.config.systems.fuelDumpRate||0)*dt);if(this.flight.fuel===0)this.systems.fuelDump=false;}

    if (this.onGround) {
      this._updateGround(dt, inputs, world);
    } else {
      this._updateAir(dt, inputs, world);
      this._updateTakeoffAutomation(dt, world);
    }
    this._updateLimits(dt);
  }

  _updateTakeoffAutomation(dt, world) {
    if (!this.takeoffAuto) return;
    this.takeoffTimer += dt;
    const agl = this.getAltitudeAgl(world);
    // Gear first, once positively climbing; then clean the flaps at a safe
    // altitude/speed. Manual selections still override afterwards.
    if (this.takeoffTimer > 1.0 && agl > 2.5 && this.systems.gearTarget > 0.5) {
      this.systems.gearTarget = 0;
    }
    // Flap cleanup is pilot-commanded. Automatically moving the flaps changes
    // lift and pitch trim abruptly at low altitude, which is exactly the nose
    // disturbance we want to avoid. The HUD prompts F above 500 km/h.
    if (this.systems.gear < 0.02) {
      this.takeoffAuto = false;
    }
  }

  _updateSystems(dt) {
    const cfg = this.config.systems;
    this.systems.gear = moveTowards(this.systems.gear,
      this.systems.gearTarget, dt / cfg.gearTime);
    this.systems.flaps = moveTowards(this.systems.flaps,
      this.systems.flapTarget, dt / cfg.flapTime);
    this.systems.airbrake = moveTowards(this.systems.airbrake,
      this.systems.airbrakeTarget, dt / cfg.brakeTime);
    this.systems.canopy = moveTowards(this.systems.canopy,
      this.systems.canopyTarget, dt / (cfg.canopyTime??1.25));
  }

  _groundOriginHeight(pitch=this.groundPitch) {
    return this.contactHeight*Math.cos(pitch)+(this.config.systems.mainGearZ||0)*Math.sin(pitch);
  }

  _updateAir(dt, inputs, world) {
    this.flight.step(dt, inputs, this.systems);

    if (this.takeoffGuard > 0) return;
    const p = this.flight.position;
    const ground = world.groundHeight(p.x, p.z);
    const agl = p.y - ground;
    if (agl > 5) return;

    const onRunway = world.isRunway(p.x, p.z, 4);
    const onAirbase = world.isAirbase(p.x, p.z);
    const gearDown = this.systems.gear >= 0.80;
    // Forgiving gameplay envelope. Approach speed alone must not turn a
    // controlled touchdown into damage. Use each airframe's wheel height,
    // rather than snapping it onto the runway at a universal 4.5 m AGL.
    const safeSink = this.flight.verticalSpeed <= 1 &&
      this.flight.verticalSpeed >= -20;
    const safeAttitude = Math.abs(this.flight.bank) <= 35 &&
      this.flight.pitch >= -28 && this.flight.pitch <= 30;
    const safeSpeed = this.flight.iasKmh <= 550;
    const wheelHeight=this._groundOriginHeight(clamp(this.flight.pitch*DEG,0,(this.config.systems.maxGroundPitchDeg??14)*DEG));
    if (agl <= wheelHeight + 0.30 && (onRunway || onAirbase) && gearDown && safeSink &&
      safeAttitude && safeSpeed) {
      const hard = this.flight.verticalSpeed < -12 ||
        Math.abs(this.flight.bank) > 25 ||
        this.flight.pitch < -18 || this.flight.pitch > 27 ||
        (this.flight.iasKmh > 500 && this.flight.verticalSpeed < -7);
      this._touchDown(ground, hard);
      return;
    }
    if (agl <= 0) {
      this._crash(world, p.y <= 0.5 || ground < 0.2);
    }
  }

  _touchDown(ground, hard = false) {
    this.onGround = true;
    this.groundSpeed = Math.max(0,
      Math.hypot(this.flight.velocity.x, this.flight.velocity.z));
    this.groundHeading = this.flight.heading * DEG;
    this.groundPitch = clamp(this.flight.pitch * DEG, 0, 10 * DEG);
    this.flight.position.y = ground + this._groundOriginHeight();
    this.flight.velocity.set(
      Math.sin(this.groundHeading) * this.groundSpeed, 0,
      -Math.cos(this.groundHeading) * this.groundSpeed);
    this.flight.rates.p = this.flight.rates.q = this.flight.rates.r = 0;
    this.flight.orientation.copy(quaternionFromAttitude(
      this.groundHeading, this.groundPitch, 0));
    this.flight.refreshGroundReadouts();
    this.takeoffGuard = 0.6;
    this.groundedLockout = 2.5;
    this.takeoffAuto = false;
    this.takeoffTimer = 0;
    this.takeoffPitchAssist = 0;
    if (hard) {
      this.health = Math.max(0, this.health - 8);
    }
    this.events.push({ type: 'landed', hard, position: this.flight.position.clone() });
  }

  _updateGround(dt, inputs, world) {
    const cfg = this.config;
    const a = cfg.aero;
    const p = this.flight.position;
    const ground = world.groundHeight(p.x, p.z);
    const onPavement = world.isRunway(p.x, p.z, 4);
    const onAirbase = world.isAirbase(p.x, p.z);
    if (p.y < ground - 2 || (!onAirbase && this.groundSpeed > 8)) {
      this._crash(world, false);
      return;
    }

    const assistInput=Math.abs(inputs.pitch||0)>.03?0:clamp((this.takeoffPitchAssist-this.groundPitch)*.5,-.06,.06);
    this.flight.advanceGround(dt, this.throttleTarget, this.systems, {...inputs,groundPitchAssist:assistInput});
    const thrust = this.flight.engineThrust;
    const rho = getAtmosphere(p.y).density;
    const speed = this.groundSpeed;
    const q = 0.5 * rho * speed * speed;
    const S = cfg.geometry.wingArea;
    const dragCd = a.cd0 + a.gearCd * this.systems.gear +
      a.flapCd * this.systems.flaps + a.storesCd * this.systems.stores;
    const drag = q * S * (dragCd+(this.systems.parachute?(this.config.systems.dragChuteCd||0):0));
    const mass = this.flight.mass;
    const weight = mass * G0;
    const rolling = (onPavement ? 0.022 : 0.065) * weight;
    const braking = (this.throttleTarget < 0.12 || this.systems.airbrake > 0.35)
      ? weight * 0.48 : 0;
    let accel = (thrust - drag - rolling - braking) / mass;
    this.groundSpeed = Math.max(0, speed + accel * dt);
    // Hold a stopped aircraft only while forces still decelerate it. With
    // positive acceleration this deadband used to erase every first step.
    if (this.groundSpeed < 0.35 && braking > 0 && accel <= 0) this.groundSpeed = 0;

    const steerAuthority = clamp(speed / 12, 0, 1) *
      (0.4 - clamp(speed / 170, 0, 1) * 0.24);
    const steer = (inputs.roll || 0) + (inputs.yaw || 0) * 0.5;
    this.groundHeading += steer * steerAuthority * dt;

    if (speed > 40) {
      // Small rotation assistance, scheduled by weight/lift and actual IAS.
      // It needs takeoff power and flaps; braking/chute or a forward stick
      // prevents automatic rotation. Pilot input always takes precedence.
      const clRotate=Math.max(.25,this.flight.aero.estimateLiftCoefficient(2.5*DEG,this.flight.mach,this.systems.flaps));
      const rotateIas=Math.sqrt(2*weight/(1.225*S*clRotate))*3.6;
      const flapAssist=smoothstep(.12,.55,this.systems.flaps)*(1-.30*smoothstep(.75,1,this.systems.flaps));
      const canAssist=braking===0&&!this.systems.parachute&&this.groundedLockout<=0;
      this.takeoffPitchAssist=canAssist?clamp(cfg.systems.takeoffPitchDeg??2.5,0,4)*DEG*flapAssist*smoothstep(.65*rotateIas,.95*rotateIas,this.flight.iasKmh)*smoothstep(.70,.92,this.throttleTarget):0;
      if(Math.abs(inputs.pitch||0)>.03)this.groundPitch+=(inputs.pitch||0)*4.2*DEG*dt;
      else this.groundPitch=moveTowards(this.groundPitch,this.takeoffPitchAssist,.8*DEG*dt);
      // systems.maxGroundPitchDeg: rotation stops short of a tail strike (tools/measure-tail-strike.mjs).
      this.groundPitch = clamp(this.groundPitch, 0, (this.config.systems.maxGroundPitchDeg ?? 14) * DEG);
    } else {
      this.takeoffPitchAssist=0;
      this.groundPitch = moveTowards(this.groundPitch, 0, 3 * DEG * dt);
    }

    const dirX = Math.sin(this.groundHeading);
    const dirZ = -Math.cos(this.groundHeading);
    p.x += dirX * this.groundSpeed * dt;
    p.z += dirZ * this.groundSpeed * dt;
    p.y = world.groundHeight(p.x, p.z) + this._groundOriginHeight();
    this.flight.velocity.set(dirX * this.groundSpeed, 0,
      dirZ * this.groundSpeed);
    this.flight.orientation.copy(quaternionFromAttitude(
      this.groundHeading, this.groundPitch, 0));
    this.flight.rates.p = this.flight.rates.q = this.flight.rates.r = 0;
    this.flight.refreshGroundReadouts();

    const mach = this.groundSpeed / 340;
    const cl = this.flight.aero.estimateLiftCoefficient(
      this.groundPitch, mach, this.systems.flaps);
    const lift = q * S * cl * 1.04;
    // Rotation assistance does not force a liftoff: lift must still carry the
    // current weight. Clean-wing departures require the pilot to rotate.
    const takeoffFlaps = this.systems.flaps > 0.40;
    const takeoffPower = this.throttleTarget > 0.70;
    if (this.groundedLockout <= 0 &&
      ((takeoffFlaps && takeoffPower) || this.groundPitch > 1.5 * DEG) &&
      lift > weight * 1.00) {
      this.onGround = false;
      this.takeoffGuard = 2.0;
      this.takeoffAuto = true;
      this.takeoffTimer = 0;
      this.flight.velocity.set(dirX * this.groundSpeed, 0,
        dirZ * this.groundSpeed);
      this.flight.orientation.copy(quaternionFromAttitude(
        this.groundHeading, this.groundPitch, 0));
      this.events.push({ type: 'takeoff', position: p.clone() });
    }
  }

  _updateLimits(dt) {
    if (!this.alive || !this.selfDamage) return;
    const cfg = this.config;
    const limits = cfg.limits;
    const ias = this.flight.iasKmh;
    const g = this.flight.normalLoad;

    let overG = 0;
    if (g > limits.structuralG) overG = (g - limits.structuralG) / 1.5;
    if (g < limits.gNegative - 1.4) overG += Math.abs(g - limits.gNegative) / 2;
    this.overLimitTime = overG > 0 ? this.overLimitTime + dt : 0;
    if (overG > 0 && this.overLimitTime > 0.15) {
      this.health -= overG * 26 * dt;
      if (Math.random() < dt * 1.5) {
        this.events.push({
          type: 'overstress', position: this.flight.position.clone(), g,
        });
      }
    }

    let overSpeed = 0;
    if (ias > limits.maxIas) overSpeed = (ias - limits.maxIas) / 180;
    this.overSpeedTime = overSpeed > 0 ? this.overSpeedTime + dt : 0;
    if (overSpeed > 0 && this.overSpeedTime > 0.25) {
      this.health -= overSpeed * 18 * dt;
    }
    if (this.systems.gear > 0.12 && ias > limits.gearIas) {
      this.health -= (ias - limits.gearIas) / 90 * dt;
    }
    const flapLimit=this.systems.flaps<=.65?(limits.flapTakeoffIas??limits.flapIas):limits.flapIas;
    if (this.systems.flaps > 0.12 && ias > flapLimit) {
      this.health -= (ias - flapLimit) / 160 * dt;
    }
    if (this.systems.airbrake > 0.2 && ias > limits.brakeIas) {
      this.health -= (ias - limits.brakeIas) / 180 * dt;
    }
    if (this.health <= 0) {
      this._destroy(this.lastAttacker, 'airframe');
    }
  }

  takeDamage(amount, attacker = null, weapon = 'gun', weaponName = null) {
    if (!this.alive) return;
    this.health -= amount;
    this.lastAttacker = attacker;
    this.lastDamageTime = this.time;
    this.events.push({
      type: 'damaged', amount, attacker, weapon, weaponName,
      position: this.flight.position.clone(),
    });
    if (this.health <= 0) {
      this._destroy(attacker, weapon, weaponName);
    }
  }

  _destroy(attacker = null, source = null, weaponName = null) {
    if (!this.alive) return;
    this.alive = false;
    this.health = 0;
    this.onGround = false;
    this.events.push({
      type: 'destroyed',
      attacker,
      source,
      weaponName,
      position: this.flight.position.clone(),
      velocity: this.flight.velocity.clone(),
      water: this.flight.position.y < 3,
    });
  }

  _crash(world, water = false) {
    if (!this.alive) return;
    this.alive = false;
    this.health = 0;
    this.onGround = false;
    const p = this.flight.position.clone();
    p.y = Math.max(p.y, world.groundHeight ? world.groundHeight(p.x, p.z) : 0);
    this.events.push({
      type: 'crashed', position: p,
      velocity: this.flight.velocity.clone(),
      water: water || p.y < 2,
    });
  }

  takeEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }

  consumeMissile() {
    const slot = this.getSelectedMissileSlot();
    if (!slot || slot.remaining <= 0 || this.weapons.missiles <= 0) return false;
    slot.remaining--;
    if(this.config.armament.trackStoreMass){this.flight.storesMass=Math.max(this.config.armament.pylonMass??160,this.flight.storesMass-(slot.category==='rocket'||slot.payloadCount>1?slot.projectileMass:slot.mass));this._refreshMass();}
    this.weapons.missiles--;
    this._syncMissileRemaining();
    if (slot.remaining <= 0) this.cycleMissile();
    return true;
  }

  _refreshMass() {
    this.flight.mass=this.config.mass.empty+(this.config.mass.engine||0)+this.flight.fuel+this.flight.ammoMass+this.flight.storesMass;
  }

  jettisonTanks() {
    if(!this.alive)return [];
    const dropped=[];
    for(const tank of this.config.armament.externalTanks||[]){
      if(this.weapons.jettisonedStations[tank.station])continue;
      // Remove the dry tank plus whatever fuel is still in it.
      const left=this.weapons.tankFuel?.[tank.station]??(tank.fuel||0);
      this.weapons.jettisonedStations[tank.station]=true;dropped.push({...tank,fuelLeft:left});
      this.flight.storesMass=Math.max(this.config.armament.pylonMass??160,this.flight.storesMass-(tank.mass-(tank.fuel||0))-left);
      if(this.weapons.tankFuel)this.weapons.tankFuel[tank.station]=0;
    }
    this._refreshMass();
    this.systems.stores=Math.min(1,this._storeDragMass()/Math.max(1,this.config.mass.stores));
    return dropped;
  }

  consumeFlare() {
    if (this.weapons.flares <= 0 || this.flareCooldown > 0) return false;
    this.weapons.flares--;
    this.flareCooldown = 0.35;
    return true;
  }

  consumeChaff() {
    if (this.weapons.chaff <= 0 || this.chaffCooldown > 0) return false;
    this.weapons.chaff--;
    this.chaffCooldown = 0.35;
    return true;
  }

  get isSupersonic() {
    return this.flight.mach > 1;
  }

  get loadFactor() {
    return this.flight.normalLoad;
  }
}
