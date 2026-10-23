/**
 * Weapons and countermeasures: cannon tracers, IR missiles, flares, warheads
 * and hit detection. Visuals are pooled; simulation is fixed-step and completely
 * deterministic apart from dispersion / flare seduction dice.
 */
import * as THREE from '../../vendor/three.module.js';
import {createVfxPlume,updateVfxPlume,vfxTexture} from '../visual/VfxAtlas.js';
import { cloneDeepSeekMissile } from '../visual/jet/missileModels.js';
import { clamp } from './math.js';
import {getAtmosphere} from './Atmosphere.js';

const G0 = 9.80665;
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _position = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _prev = new THREE.Vector3();
const _seg = new THREE.Vector3();
const _rel = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _matrix = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _one = new THREE.Vector3(1, 1, 1);
const _zAxis = new THREE.Vector3(0, 0, 1);
const _color = new THREE.Color();

function pointSegmentDistanceSq(point, a, b) {
  _seg.subVectors(b, a);
  const lenSq = _seg.lengthSq();
  if (lenSq < 1e-6) return point.distanceToSquared(a);
  const t = clamp(_rel.subVectors(point, a).dot(_seg) / lenSq, 0, 1);
  return point.distanceToSquared(
    _aim.copy(a).addScaledVector(_seg, t));
}

function makeFlareTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,235,1)');
  grad.addColorStop(0.18, 'rgba(255,240,180,1)');
  grad.addColorStop(0.45, 'rgba(255,140,55,.7)');
  grad.addColorStop(1, 'rgba(255,80,20,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}


export class CombatSystem {
  constructor({
    scene, world, effects, audio, getAircraft, getPlayer,
  }) {
    this.scene = scene;
    this.world = world;
    this.effects = effects;
    this.audio = audio;
    this.getAircraft = getAircraft;
    this.getPlayer = getPlayer;
    this.projectiles = [];
    this.missiles = [];
    this.flares = [];
    this.chaffs = [];
    this.retiredTrails = [];
    this.jettisonedStores = [];
    this.flareTexture = makeFlareTexture();
    this.tracers = this._buildTracers();
    this.time = 0;
  }

  _buildTracers() {
    const geo = new THREE.BoxGeometry(0.13, 0.13, 7.5);
    const mat = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, 420);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.renderOrder = 2;
    // Force allocation of instanceColor so per-team tracer tints work.
    mesh.setColorAt(0, new THREE.Color(0xffffff));
    mesh.instanceColor.needsUpdate = true;
    this.scene.add(mesh);
    return mesh;
  }

  reset() {
    this.projectiles.length = 0;
    for (const m of this.missiles) this._disposeMissile(m);
    this.missiles.length = 0;
    for (const f of this.flares) this._disposeFlare(f);
    this.flares.length = 0;
    for (const c of this.chaffs) this._disposeFlare(c);
    this.chaffs.length = 0;
    for (const t of this.retiredTrails) this.effects.removeTrail(t.trail);
    this.retiredTrails.length = 0;
    for(const d of this.jettisonedStores)this._removeMissileMesh(d);this.jettisonedStores.length=0;
    this.tracers.count = 0;
  }

  fireGun(aircraft, dt, trigger) {
    aircraft.gunFire = false;
    if (!aircraft.alive || aircraft.onGround) {
      aircraft._gunSpinTime = 0;
      aircraft._gunAccumulator = Math.min(aircraft._gunAccumulator || 0, 1);
      return;
    }
    if (!trigger) {
      aircraft._gunSpinTime = 0;
      return;
    }
    const cannon = aircraft.config.armament.cannon;
    if (aircraft.weapons.ammo <= 0) return;
    // The M61 is a rotating-barrel gun: the motor spins up before the first
    // round leaves the barrel. This delay is only applied to firing, not to
    // the trigger or HUD state.
    aircraft._gunSpinTime = (aircraft._gunSpinTime || 0) + dt;
    if (aircraft._gunSpinTime < (cannon.spinUpTime || 0)) return;
    aircraft.gunFire = true;
    aircraft._gunAccumulator = (aircraft._gunAccumulator || 0) +
      dt * (cannon.rate / 60);
    aircraft._shotCounter = aircraft._shotCounter || 0;
    let shots = 0;
    while (aircraft._gunAccumulator >= 1 && aircraft.weapons.ammo > 0 && shots < 4) {
      aircraft._gunAccumulator -= 1;
      aircraft.weapons.ammo--;
      if(cannon.trackAmmoMass)aircraft.flight.ammoMass=Math.max(0,aircraft.flight.ammoMass-cannon.mass);
      aircraft._shotCounter++;
      shots++;
      const basis = aircraft.flight.basis;
      _forward.copy(basis.forward);
      _right.copy(basis.right);
      _up.copy(basis.up);
      const muzzle = cannon.muzzle;
      _position.copy(aircraft.flight.position)
        .addScaledVector(_right, muzzle[0])
        .addScaledVector(_up, muzzle[1])
        .addScaledVector(_forward, -muzzle[2]);
      const spread = cannon.dispersion;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * spread;
      _dir.copy(_forward)
        .addScaledVector(_right, Math.cos(a) * r)
        .addScaledVector(_up, Math.sin(a) * r)
        .normalize();
      const velocity = aircraft.flight.velocity.clone()
        .addScaledVector(_dir, cannon.muzzleVelocity);
      // Belted cannons (J-16 30 mm, J-10C 23 mm): per-shell damage and tracers.
      // Belted cannons: per-shell damage, tracer shells and penetration all come from cannon config.
      const belt=cannon.belts?.[cannon.belt||'default'],shell=belt?.[(aircraft._shotCounter-1)%belt.length],belted=!!belt;
      this.projectiles.push({
        position: _position.clone(),
        prev: _position.clone(),
        velocity,
        life: cannon.life,
        owner: aircraft,
        team: aircraft.team,
        damage: belted?(cannon.shellDamage?.[shell]||cannon.damage):cannon.damage,
        shell,origin:_position.clone(),penetration:belted?cannon.penetration:null,
        weaponName: cannon.name,
        tracer: belted?(cannon.tracerShells||[]).includes(shell):aircraft._shotCounter % cannon.tracerEvery === 0,
        drag: cannon.drag,
      });
    }
    // Keep the pool bounded even under long bursts.
    if (this.projectiles.length > 900) {
      this.projectiles.splice(0, this.projectiles.length - 900);
    }
  }

  updateProjectiles(dt) {
    const aircraft = this.getAircraft();
    const cull = [];
    for (const p of this.projectiles) {
      p.prev.copy(p.position);
      const speed = p.velocity.length();
      if (speed > 0.01) {
        p.velocity.addScaledVector(p.velocity, -p.drag * speed * dt);
      }
      p.velocity.y -= G0 * dt;
      p.position.addScaledVector(p.velocity, dt);
      p.life -= dt;
      let dead = false;

      for (const target of aircraft) {
        if (!target.alive || target.team === p.team) continue;
        const radius=target.config?.geometry?.hitRadius??7.2,radiusSq=radius*radius;
        if (pointSegmentDistanceSq(target.flight.position, p.prev, p.position) < radiusSq) {
          let damage=p.damage;
          if(p.penetration&&target.config?.armorMm){const distance=p.position.distanceTo(p.origin),table=p.penetration.apShells?.includes(p.shell)?p.penetration.apT:p.penetration.aphe,index=p.penetration.distance.findIndex(v=>v>=distance),penetration=table[index<0?table.length-1:index];if(penetration<target.config.armorMm)damage*=.20;}
          target.takeDamage(damage, p.owner, 'cannon', p.weaponName);
          this.effects.impact(p.position, p.velocity.clone().normalize(), 'metal');
          dead = true;
          break;
        }
      }
      if (!dead) {
        const gh = this.world.groundHeight(p.position.x, p.position.z);
        const water = gh < 0.4;
        if (p.position.y <= (water ? 0.4 : gh)) {
          this.effects.impact(p.position, new THREE.Vector3(0, 1, 0),
            water ? 'water' : 'metal');
          dead = true;
        }
      }
      if (dead) cull.push(p);
    }
    if (cull.length) {
      for (const p of cull) {
        const index = this.projectiles.indexOf(p);
        if (index >= 0) this.projectiles.splice(index, 1);
      }
    }
    if (this.projectiles.length) {
      this.projectiles = this.projectiles.filter((p) => p.life > 0);
    }
    this._updateTracerInstances();
  }

  _updateTracerInstances() {
    let index = 0;
    for (const p of this.projectiles) {
      if (!p.tracer) continue;
      if (index >= 420) break;
      _dir.copy(p.velocity).normalize();
      _quat.setFromUnitVectors(_zAxis, _dir);
      _matrix.compose(p.position, _quat, _one);
      this.tracers.setMatrixAt(index, _matrix);
      if (this.tracers.instanceColor) {
        _color.set(p.team === 'blue' ? 0xffb463 : 0xff6750);
        this.tracers.setColorAt(index, _color);
      }
      index++;
    }
    this.tracers.count = index;
    this.tracers.instanceMatrix.needsUpdate = true;
    if (this.tracers.instanceColor) this.tracers.instanceColor.needsUpdate = true;
  }

  launchMissile(aircraft, target) {
    if (!aircraft.alive || !target || !target.alive) return false;
    if(aircraft.visual?.ready&&!aircraft.visual.airframe)return false;
    const missiles = aircraft.getMissileConfig();
    if(missiles.targetType==='air'&&target.isGroundTarget)return false;
    if(missiles.targetType==='emitter'&&(target.isGroundTarget||target.radarEmitting===false))return false;
    if (!aircraft.consumeMissile()) return false;
    // The shooter's radar/datalink supports the missile until its seeker goes
    // active. The AI has no separate radar module, so set this here too.
    aircraft.datalinkTarget = target;
    const total = aircraft.config.armament.missileLoadout
      ?.reduce((sum, m) => sum + m.count, 0)
      ?? aircraft.config.armament.missiles.count;
    const firedIndex = total - aircraft.weapons.missiles;
    const offsets = aircraft.config.armament.cannon.launchOffsets || [[0, -0.4, 1.2]];
    const offset = offsets[(firedIndex - 1 + offsets.length) % offsets.length];
    const basis = aircraft.flight.basis;
    _position.copy(aircraft.flight.position)
      .addScaledVector(basis.right, offset[0])
      .addScaledVector(basis.up, offset[1])
      .addScaledVector(basis.forward, -offset[2]);
    _dir.copy(basis.forward).multiplyScalar(80)
      .add(aircraft.flight.velocity).normalize();
    const velocity = aircraft.flight.velocity.clone();
    const launchPose=aircraft.visual?.getMissileLaunchPose?.(missiles.type,aircraft.weapons.missileRemaining?.[missiles.type] ?? 0);
    if (launchPose) {
      // Rendering may interpolate one physics tick behind the owner. Launch
      // from the current rigid-body pose, with the same mounted local offset.
      if(launchPose.localPosition) _position.copy(launchPose.localPosition).applyQuaternion(aircraft.flight.orientation).add(aircraft.flight.position);
      else _position.copy(launchPose.position);
    }
    const mesh=aircraft.visual?.createCadMissileMesh?.(launchPose?.storeId || missiles.type) || cloneDeepSeekMissile(missiles.type);
    mesh.position.copy(_position);
    if(launchPose) mesh.quaternion.copy(aircraft.flight.orientation);
    else mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), _dir);
    this.scene.add(mesh);
    const rocketPlume=createVfxPlume(2);rocketPlume.position.z=(mesh.userData.length||3)*.5;mesh.add(rocketPlume);
    const trail = this.effects.createTrail({
      maxPoints: 70,
      width: .19,
      color: '#c5c9c9',
      opacity: .32,
      lifetime: 2.2,
      minSegment: .8,
      map:vfxTexture(),mapRect:[0,0,.25,.25],repeatLength:9,
    });
    this.missiles.push({
      position: _position.clone(),
      velocity,
      owner: aircraft,
      team: aircraft.team,
      target,
      mesh,
      trail,
      rocketPlume,
      ignitionDelay:launchPose?.releaseMode==='eject'?.24:.015,
      releaseMode:launchPose?.releaseMode||'rail',
      railTime:launchPose?.releaseMode==='drop'?.08:launchPose?.releaseMode==='eject'?.25:.18,
      railLength:1.1,
      railLocal:launchPose?.localPosition || new THREE.Vector3(...offset),
      railSpeed:0,railDistance:0,
      life: 0,
      alive: true,
      boostTime: missiles.boostTime,
      boostAccel: missiles.boostAccel,
      sustainTime: missiles.sustainTime || 0,
      sustainAccel: missiles.sustainAccel || 0,
      maxG: missiles.maxG,
      damage: missiles.damage,
      weaponName: missiles.name,
      weaponType: missiles.type,
      mass:missiles.projectileMass||missiles.mass,tnt:missiles.tnt,
      station:launchPose?.station,
      proximity: missiles.proximity,
      drag: missiles.drag,
      launchEnergy: 0.5 * velocity.lengthSq() + G0 * _position.y,
      selfDestructSpeed: missiles.selfDestructSpeed ?? 150,
      energyFloor: missiles.energyFloor ?? 0.10,
      irSeeker: missiles.irSeeker !== false,
      radar: !!missiles.radar,
      guidance: missiles.guidance || (missiles.irSeeker === false ? 'sarh' : 'ir'),
      datalink: !!missiles.datalink,
      activeRange: missiles.activeRange || 0,
      seekerRange: missiles.seekerRange || 0,
      seekerAngle: missiles.seekerAngle || 0,
      chaffSusceptibility: missiles.chaffSusceptibility ?? 0.25,
      flareSusceptibility:missiles.flareSusceptibility??.55,
      statLimits:!!missiles.statLimits,maxMach:missiles.maxMach,maxSpeedMps:missiles.maxSpeedMps,
      maxRange:missiles.maxRange,guidanceTime:missiles.guidanceTime,travelled:0,ballistic:!!missiles.ballistic,glide:!!missiles.glide,
      targetType:missiles.targetType,blastRadius:missiles.blastRadius||26,retarded:missiles.retarded,
      pitbull: false,
      initialTarget: target,
      lastKnown: target.flight.position.clone(),
      lostTime: 0,
    });
    const dist = this.getPlayer()
      ? _position.distanceTo(this.getPlayer().flight.position) : 0;
    if ((aircraft === this.getPlayer() || dist < 800)&&!missiles.ballistic&&!missiles.glide) this.audio.missileLaunch();
    return true;
  }

  jettisonTanks(aircraft) {
    const dropped=aircraft.jettisonTanks(),meshes=aircraft.visual?.releaseExternalTanks?.(dropped.map(t=>t.station))||[];
    for(const mesh of meshes){this.scene.add(mesh);this.jettisonedStores.push({mesh,velocity:aircraft.flight.velocity.clone().add(new THREE.Vector3(0,-3,0)),life:0});}
    return dropped;
  }

  updateJettisonedStores(dt) {
    this.jettisonedStores=this.jettisonedStores.filter(d=>{d.life+=dt;d.velocity.y-=G0*dt;d.mesh.position.addScaledVector(d.velocity,dt);d.mesh.rotateX(.25*dt);
      if(d.life>20||d.mesh.position.y<=Math.max(.3,this.world.groundHeight(d.mesh.position.x,d.mesh.position.z))){this._removeMissileMesh(d);return false;}return true;});
  }

  deployFlares(aircraft, count = 2) {
    if (!aircraft.alive) return false;
    if (!aircraft.consumeFlare()) return false;
    const basis = aircraft.flight.basis;
    for (let i = 0; i < count; i++) {
      const pos = aircraft.flight.position.clone()
        .addScaledVector(basis.forward, -2 - i * 1.8)
        .addScaledVector(basis.up, -0.8 - i * 0.6)
        .addScaledVector(basis.right, (i - 0.5) * 2.3);
      const vel = aircraft.flight.velocity.clone().multiplyScalar(0.72)
        .addScaledVector(basis.up, -10 - Math.random() * 7)
        .addScaledVector(basis.right, (Math.random() - 0.5) * 32)
        .addScaledVector(basis.forward, -12);
      const mat = new THREE.SpriteMaterial({
        map: this.flareTexture,
        color: 0xffe4aa,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.position.copy(pos);
      sprite.scale.setScalar(3.4);
      this.scene.add(sprite);
      this.flares.push({
        position: pos,
        velocity: vel,
        life: 0,
        maxLife: aircraft.config.armament.flare.burnTime,
        alive: true,
        team: aircraft.team,
        sprite,
        heat: 1,
        isFlare: true,
      });
    }
    if (aircraft === this.getPlayer()) this.audio.flarePop();
    return true;
  }

  deployChaff(aircraft, count = 2) {
    if (!aircraft.alive) return false;
    if (!aircraft.consumeChaff()) return false;
    const basis = aircraft.flight.basis;
    for (let i = 0; i < count; i++) {
      const pos = aircraft.flight.position.clone()
        .addScaledVector(basis.forward, -2.5 - i * 1.4)
        .addScaledVector(basis.up, -0.6)
        .addScaledVector(basis.right, (i - 0.5) * 1.8);
      const vel = aircraft.flight.velocity.clone().multiplyScalar(0.58)
        .addScaledVector(basis.up, -6 - Math.random() * 5)
        .addScaledVector(basis.right, (Math.random() - 0.5) * 18)
        .addScaledVector(basis.forward, -9);
      const mat = new THREE.SpriteMaterial({
        map: this.flareTexture,
        color: 0xc8d2cc,
        transparent: true,
        opacity: 0.58,
        depthWrite: false,
        toneMapped: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.position.copy(pos);
      sprite.scale.setScalar(5.2);
      this.scene.add(sprite);
      this.chaffs.push({
        position: pos,
        velocity: vel,
        life: 0,
        maxLife: 4.2,
        alive: true,
        team: aircraft.team,
        sprite,
        isChaff: true,
        isCountermeasure: true,
      });
    }
    if (aircraft === this.getPlayer()) this.audio.flarePop();
    return true;
  }

  updateMissiles(dt) {
    for (const m of this.missiles) {
      if (!m.alive) continue;
      m.life += dt;
      if(m.statLimits&&m.releaseMode!=='rail'&&m.life<m.railTime){
        const f=m.owner.flight,down=new THREE.Vector3(0,-1,0).applyQuaternion(f.orientation),drop=2.5*m.life+.5*G0*m.life*m.life;
        m.position.copy(m.railLocal).applyQuaternion(f.orientation).add(f.position).addScaledVector(down,drop);
        m.velocity.copy(f.velocity).addScaledVector(down,2.5+G0*m.life);m.mesh.position.copy(m.position);m.mesh.quaternion.copy(f.orientation);this._updateMissileTexture(m);continue;
      }
      if(m.life<m.railTime && m.railDistance<m.railLength){
        const f=m.owner.flight,forward=new THREE.Vector3(0,0,-1).applyQuaternion(f.orientation);
        const burningDt=THREE.MathUtils.clamp(m.life-m.ignitionDelay,0,dt);
        m.railSpeed+=m.boostAccel*burningDt;
        m.railDistance+=m.railSpeed*dt;
        m.position.copy(m.railLocal).applyQuaternion(f.orientation).add(f.position).addScaledVector(forward,m.railDistance);
        m.velocity.copy(f.velocity).addScaledVector(forward,m.railSpeed);
        m.mesh.position.copy(m.position);m.mesh.quaternion.copy(f.orientation);
        this._updateMissileTexture(m);
        continue;
      }
      const speed = m.velocity.length();
      if (m.target && m.target.alive === false) {
        m.target = null;
      }

      // Flares can seduce an IR seeker before the terminal phase.
      if (m.irSeeker && m.target && !m.target.isFlare && m.life < 8) {
        for (const flare of this.flares) {
          if (!flare.alive || flare.team !== m.target.team || flare.heat <= 0) continue;
          _rel.copy(flare.position).sub(m.position);
          const d = _rel.length();
          if (d > 1500 || d < 1) continue;
          _rel.multiplyScalar(1 / d);
          if (_rel.dot(_dir.copy(m.velocity).normalize()) < 0.78) continue;
          if (Math.random() < dt * (m.flareSusceptibility??.55)) {
            m.target = flare;
            break;
          }
        }
      }

      // Radar-guided missiles can be seduced by chaff. The AI R-27R is
      // deliberately very vulnerable; the player's AMRAAM is harder to spoof.
      if (m.radar && m.target && !m.target.isCountermeasure && !m.chaffed) {
        for (const chaff of this.chaffs) {
          if (!chaff.alive || chaff.team !== m.target.team) continue;
          _rel.copy(chaff.position).sub(m.position);
          const d = _rel.length();
          if (d > 2600 || d < 1) continue;
          _rel.multiplyScalar(1 / d);
          if (_rel.dot(_dir.copy(m.velocity).normalize()) < 0.42) continue;
          const chance = dt * (0.35 + m.chaffSusceptibility * 2.2);
          if (Math.random() < chance) {
            m.target = chaff;
            m.pitbull = false;
            m.seekerTarget = null;
            m.chaffed = true;
            m.lostTime = 0;
            break;
          }
        }
      }

      // Datalink / active-radar guidance.
      // Before the AIM-120 goes pitbull the shooter's radar feeds target
      // position updates. Once inside the seeker envelope it switches to its
      // own active radar; a SARH (AIM-7) still needs the shooter's lock.
      const original = m.initialTarget;
      let linked = false;
      if (original && original.alive && !m.chaffed) {
        const op = original.flight.position;
        linked = m.datalink && m.owner && m.owner.alive &&
          m.owner.datalinkTarget === original;
        if (linked) m.lastKnown.copy(op);
        if (m.guidance === 'activeRadar' && !m.pitbull) {
          _rel.copy(op).sub(m.position);
          const d = _rel.length();
          const losAngle = Math.acos(clamp(
            _rel.dot(m.velocity) / Math.max(1, d * m.velocity.length()),
            -1, 1));
          if (d <= m.activeRange && d <= m.seekerRange &&
            losAngle <= m.seekerAngle) {
            m.pitbull = true;
            m.seekerTarget = original;
          }
        }
      }
      if (!linked && ['sarh','activeRadar'].includes(m.guidance) && !m.pitbull && !m.chaffed) {
        // Datalink lost: fly to the last known point. The active seeker can
        // still acquire the original target when it enters its envelope.
        m.target = null;
      }
      if(m.guidance==='antiRadiation'&&m.target?.radarEmitting===false){m.lastKnown.copy(m.target.flight.position);m.target=null;}

      const track = m.pitbull ? m.seekerTarget : m.target;
      m.guidanceTarget = track && track.alive !== false ? track : null;
      if (m.guidanceTarget) {
        const targetPos = m.guidanceTarget.isCountermeasure
          ? m.guidanceTarget.position : m.guidanceTarget.flight.position;
        const targetVel = m.guidanceTarget.isCountermeasure
          ? m.guidanceTarget.velocity : m.guidanceTarget.flight.velocity;
        const dist = m.position.distanceTo(targetPos);
        const timeToGo = dist / Math.max(180, speed);
        _aim.copy(targetPos)
          .addScaledVector(targetVel, Math.min(1.4, timeToGo * 0.72));
        _dir.copy(_aim).sub(m.position).normalize();
      } else if (m.lastKnown) {
        _dir.copy(m.lastKnown).sub(m.position).normalize();
      } else {
        _dir.copy(m.velocity).normalize();
      }

      // Turn toward the aim point under a G-limited airframe.
      const current = m.velocity.length();
      if (current > 1 && !m.ballistic && m.guidance!=='unguided') {
        const cos = clamp(m.velocity.dot(_dir) / current, -1, 1);
        const angle = Math.acos(cos);
        const maxTurn = (m.maxG * G0 / Math.max(120, current)) * dt;
        if (angle > 1e-5) {
          _axis.crossVectors(m.velocity, _dir);
          if (_axis.lengthSq() < 1e-8) _axis.set(0, 1, 0);
          _axis.normalize();
          _quat.setFromAxisAngle(_axis, Math.min(angle, maxTurn));
          m.velocity.applyQuaternion(_quat);
        }
        if (angle > 1.15) m.lostTime += dt; else m.lostTime = 0;
        if (m.lostTime > 1.2) {
          m.lostTime = 0;
          m.target = null;
        }
      }

      // Propulsion and drag. The motor has a finite boost/sustain phase; after
      // burnout the missile coasts and loses energy instead of accelerating.
      let thrust = 0;
      const motorAge=m.statLimits?Math.max(0,m.life-m.ignitionDelay):m.life;
      if(m.guidance==='unguided')_dir.copy(m.velocity).normalize();
      if (motorAge < m.boostTime) {
        thrust = m.boostAccel;
      } else if (motorAge < m.boostTime + m.sustainTime) {
        thrust = m.sustainAccel;
      }
      if (thrust > 0) m.velocity.addScaledVector(_dir, thrust * dt);
      const v = m.velocity.length();
      const airDrag=m.statLimits?Math.max(.08,getAtmosphere(m.position.y).density/1.225):1;
      if (v > 0) m.velocity.multiplyScalar(Math.max(0.2, 1 - m.drag * airDrag * v * dt));
      if(m.statLimits){
        m.velocity.y-=G0*dt;
        if(m.retarded&&m.life>1)m.velocity.multiplyScalar(Math.exp(-.8*dt));
        if(m.glide){const lift=.90*G0*clamp(v/140,0,1);m.velocity.y+=lift*dt;}
        const speedLimit=m.maxSpeedMps||(m.maxMach?m.maxMach*getAtmosphere(m.position.y).speedOfSound:Infinity);if(m.velocity.length()>speedLimit)m.velocity.setLength(speedLimit);
        m.travelled+=m.velocity.length()*dt;
      }
      m.position.addScaledVector(m.velocity, dt);

      _quat.setFromUnitVectors(new THREE.Vector3(0, 0, -1),
        _dir.copy(m.velocity).normalize());
      m.mesh.position.copy(m.position);
      m.mesh.quaternion.copy(_quat);
      this._updateMissileTexture(m);

      let detonate = false;
      const hitTarget = m.guidanceTarget || m.target;
      if (hitTarget && !m.ballistic && !m.glide) {
        const targetPos = hitTarget.isCountermeasure
          ? hitTarget.position : hitTarget.flight.position;
        if (m.position.distanceTo(targetPos) < m.proximity + 6) {
          detonate = true;
        }
      } else if (!m.ballistic && !m.glide && m.lastKnown &&
        m.position.distanceTo(m.lastKnown) < m.proximity + 3) {
        detonate = true;
      }
      const gh = this.world.groundHeight(m.position.x, m.position.z);
      if (m.position.y < Math.max(0.3, gh)) detonate = true;
      // No arbitrary flight-time timeout: a missile lives while it still has
      // useful speed/energy. Once the motor is out and its total specific
      // energy has collapsed, it self-destructs.
      const speedNow = m.velocity.length();
      const energy = 0.5 * speedNow * speedNow + G0 * m.position.y;
      const energyRatio = m.launchEnergy > 0 ? energy / m.launchEnergy : 1;
      const burnedOut = motorAge >= m.boostTime + m.sustainTime;
      if (speedNow < m.selfDestructSpeed ||(m.statLimits&&(m.life>(m.guidanceTime||300)||m.travelled>m.maxRange))||
        (burnedOut && energyRatio < m.energyFloor)) {
        detonate = true;
      }
      if (detonate) {
        this._detonateMissile(m);
      }
    }
    this.missiles = this.missiles.filter((m) => m.alive);
  }

  _updateMissileTexture(m) {
    const motorAge=m.statLimits?Math.max(0,m.life-m.ignitionDelay):m.life;
    const burning=m.boostTime>0&&m.life>m.ignitionDelay && motorAge<m.boostTime+m.sustainTime;
    const start=THREE.MathUtils.smoothstep(m.life-m.ignitionDelay,0,.06);
    const power=burning?start*(m.life<m.boostTime?1:.58):0;
    updateVfxPlume(m.rocketPlume,{time:m.life,intensity:power,length:.35+1.75*start,diameter:.28+.12*start});
    if(power>0){const tail=new THREE.Vector3(0,0,(m.mesh.userData.length||3)*.5).applyQuaternion(m.mesh.quaternion).add(m.position);m.trail.push(tail);}
  }

  _removeMissileMesh(m) {
    if(!m.mesh)return;this.scene.remove(m.mesh);
    m.mesh.traverse(o=>{o.geometry?.dispose();if(o.material){for(const mat of Array.isArray(o.material)?o.material:[o.material]){if(mat.map&&!mat.map.userData?.sharedVfx)mat.map.dispose();mat.dispose();}}});
  }

  _detonateMissile(m) {
    if (!m.alive) return;
    m.alive = false;
    if(m.ballistic||m.glide){
      const height=this.world.groundHeight(m.position.x,m.position.z),water=height<.4,ground=Math.max(.3,height),airburst=m.position.y>ground+6;
      if(!airburst)m.position.y=ground+.15;
      const normal=water?new THREE.Vector3(0,1,0):new THREE.Vector3(this.world.groundHeight(m.position.x-1,m.position.z)-this.world.groundHeight(m.position.x+1,m.position.z),2,this.world.groundHeight(m.position.x,m.position.z-1)-this.world.groundHeight(m.position.x,m.position.z+1)).normalize();
      this.effects.bombExplosion(m.position,{mass:m.mass,tnt:m.tnt,groundHeight:ground,normal,surface:water?'water':'ground',airburst});
    }else this.effects.explosion(m.position, 0.75, m.velocity);
    const player = this.getPlayer();
    const distance = player ? m.position.distanceTo(player.flight.position) : 1000;
    this.audio.explosion(distance,m.ballistic||m.glide?1.2:.8);
    if (m.target && !m.target.isCountermeasure && m.target.alive) {
      const dist = m.position.distanceTo(m.target.flight.position);
      const radius=m.statLimits?m.blastRadius:26;
      if (dist < radius) {
        const falloff = m.statLimits?(dist<=radius*.75?1:clamp(1-(dist-radius*.75)/radius,.55,1)):(dist<=20?1:clamp(1-(dist-20)/20,.55,1));
        m.target.takeDamage(m.damage * falloff, m.owner, 'missile', m.weaponName);
      }
    }
    if(m.statLimits&&m.target?.isGroundTarget)for(const target of this.getAircraft()){if(!target.alive||target.team===m.team)continue;const distance=target.flight.position.distanceTo(m.position);if(distance<m.blastRadius)target.takeDamage(m.damage*Math.max(.1,1-distance/m.blastRadius),m.owner,'missile',m.weaponName);}
    this._removeMissileMesh(m);
    this.retiredTrails.push({ trail: m.trail, life: 4 });
  }

  _disposeMissile(m) {
    this._removeMissileMesh(m);
    if (m.trail) this.effects.removeTrail(m.trail);
  }

  _disposeFlare(f) {
    if (f.sprite) {
      this.scene.remove(f.sprite);
      f.sprite.material.dispose();
    }
  }

  updateFlares(dt) {
    for (const f of this.flares) {
      if (!f.alive) continue;
      f.life += dt;
      f.velocity.y -= G0 * 0.45 * dt;
      f.velocity.multiplyScalar(Math.exp(-0.55 * dt));
      f.position.addScaledVector(f.velocity, dt);
      f.sprite.position.copy(f.position);
      const t = f.life / f.maxLife;
      f.heat = Math.max(0, 1 - t * 1.6);
      f.sprite.material.opacity = clamp(1 - t, 0, 1) *
        (0.7 + Math.sin(f.life * 70) * 0.25);
      f.sprite.scale.setScalar(2.5 + Math.sin(f.life * 30) * 0.6);
      if (f.life >= f.maxLife) {
        f.alive = false;
        this._disposeFlare(f);
      }
    }
    this.flares = this.flares.filter((f) => f.alive);
  }

  updateChaff(dt) {
    for (const c of this.chaffs) {
      if (!c.alive) continue;
      c.life += dt;
      // Chaff decelerates quickly and settles into the airmass.
      c.velocity.y -= G0 * 0.18 * dt;
      c.velocity.multiplyScalar(Math.exp(-1.6 * dt));
      c.position.addScaledVector(c.velocity, dt);
      c.sprite.position.copy(c.position);
      const t = c.life / c.maxLife;
      c.sprite.material.opacity = clamp(1 - t, 0, 1) * 0.55;
      c.sprite.scale.setScalar(5.2 + t * 3.5);
      if (c.life >= c.maxLife) {
        c.alive = false;
        this._disposeFlare(c);
      }
    }
    this.chaffs = this.chaffs.filter((c) => c.alive);
  }

  updateRetiredTrails(dt) {
    for (const t of this.retiredTrails) {
      t.life -= dt;
      if (t.life <= 0) this.effects.removeTrail(t.trail);
    }
    this.retiredTrails = this.retiredTrails.filter((t) => t.life > 0);
  }

  update(dt) {
    this.time += dt;
    this.updateProjectiles(dt);
    this.updateMissiles(dt);
    this.updateFlares(dt);
    this.updateChaff(dt);
    this.updateRetiredTrails(dt);
    this.updateJettisonedStores(dt);
  }

  getIncomingMissiles(aircraft) {
    return this.missiles.filter((m) => m.alive && m.target === aircraft);
  }

  get entityCount() {
    return this.projectiles.length + this.missiles.length +
      this.flares.length + this.chaffs.length;
  }
}
