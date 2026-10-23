// Actual simulated states only: this game does not model separate hydraulic,
// generator or left/right engine failures.
export class CockpitWarnings {
  constructor(audio) { this.audio = audio; this.reset(); }
  reset() { this.next = new Map(); this.previous = null; }

  _say(id, active, keys, time, priority = 20, repeat = 20) {
    if (!active) { this.next.delete(id); return; }
    if (time < (this.next.get(id) ?? -Infinity)) return;
    // A not-yet-loaded pack must not consume a condition's first announcement.
    if (this.audio.playSequence(keys, { id, priority, cooldown: 3 })) {
      this.next.set(id, time + repeat);
    }
  }

  direction(threat) {
    if (!threat) return [];
    const angle = Math.abs(threat.bearing);
    const keys = [angle < Math.PI / 4 ? 'vws_ahead'
      : angle > Math.PI * 3 / 4 ? 'vws_behind'
        : threat.bearing < 0 ? 'vws_left' : 'vws_right'];
    if (Math.abs(threat.altDelta || 0) > Math.max(180, threat.range * 0.18)) {
      keys.push(threat.altDelta > 0 ? 'vws_high' : 'vws_low');
    }
    return keys;
  }

  update({ player: p, warnings = [], agl, rwr = {}, time }) {
    if (!p?.alive) { this.reset(); return; }
    const f = p.flight, weapons = p.weapons, systems = p.systems;
    const has = text => warnings.some(w => w.text === text);
    const airborne = !p.onGround;
    const closest = predicate => (rwr.threats || []).filter(predicate)
      .reduce((best, t) => !best || t.range < best.range ? t : best, null);

    this._say('pull-up', has('PULL UP'), ['vws_pull_up'], time, 100, 3);
    this._say('missile', !!rwr.missile,
      ['rwr_missile', ...this.direction(closest(t => t.missile))], time, 90, 5);
    this._say('terrain', airborne && systems.gear < 0.12 && agl < 120 &&
      f.verticalSpeed <= 0 && !has('PULL UP'), ['vws_critical_altitude'], time, 85, 7);
    this._say('stall', airborne && has('STALL'), ['vws_critical_angle'], time, 80, 6);
    this._say('speed', has('OVERSPEED'), ['vws_critical_speed'], time, 78, 8);
    this._say('gear-check', has('GEAR UP') || has('GEAR OVERSPEED'),
      ['vws_check_gear'], time, 75, 9);
    this._say('over-g', airborne && p.gLoad > 7.5, ['vws_over_g'], time, 70, 6);
    this._say('rwr-lock', !!rwr.locked && !rwr.missile,
      ['rwr_lock', ...this.direction(closest(t => t.mode === 'lock'))], time, 65, 12);
    this._say('rwr-track', !!rwr.tracked && !rwr.locked && !rwr.missile,
      ['vws_attack_air', ...this.direction(closest(t => !t.missile))], time, 40, 20);
    this._say('fuel-critical', f.fuel < 100 && f.fuel > 0,
      ['vws_bingo'], time, 45, 25);
    this._say('fuel-low', f.fuel >= 100 && f.fuel < 280,
      ['vws_fuel_low'], time, 30, 40);
    this._say('engine-out', airborne && f.fuel <= 0 && f.engineSpool < 0.12,
      ['vws_engine_failure'], time, 80, 20);
    this._say('damage', p.health < 55, ['vws_check_mech'], time, 35, 30);
    this._say('flap-speed', has('FLAP OVERSPEED') || has('FLAP CLEANUP · F'),
      ['vws_check_mech'], time, 25, 30);
    this._say('ammo-empty', weapons.ammo <= 0,
      ['gunner_out_of_ammo'], time, 15, 60);
    this._say('countermeasure-low', (weapons.flares > 0 && weapons.flares <= 6) ||
      (weapons.chaff > 0 && weapons.chaff <= 6), ['vws_chaff_flare_low'], time, 30, 30);
    this._say('countermeasure-empty', weapons.flares + weapons.chaff <= 0,
      ['vws_out'], time, 30, 60);
    this._say('boundary', has('RETURN TO COMBAT AREA'), ['vws_warning'], time, 30, 20);

    const previous = this.previous;
    if (previous) {
      if (systems.gear >= 0.98 && previous.gear < 0.98) {
        this.audio.callout('vws_gear_down', '起落架放下。', { cooldown: 6 });
      }
      if (systems.airbrake > 0.2 && previous.airbrake <= 0.2) {
        this.audio.callout('vws_airbrake', '减速板开启。', { cooldown: 6 });
      }
      if (weapons.flares < previous.flares || weapons.chaff < previous.chaff) {
        this.audio.callout('vws_chaff_flare', '释放干扰弹。', { cooldown: 8 });
      }
    }
    this.previous = { gear: systems.gear, airbrake: systems.airbrake,
      flares: weapons.flares, chaff: weapons.chaff };
  }
}
