import { VOICE_PACKS } from '../data/voicePacks.js';
const PROJECT_ROOT = new URL('../../', import.meta.url);
const audioUrl = path => new URL(path, PROJECT_ROOT);

/**
 * Local sampled engine, weapons and selectable cockpit voice packs, with
 * procedural fallback effects. Audio starts after a user gesture.
 */
function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

export class AudioEngine {
  constructor({sampleManifest='audio/pack.json',voices=true,tones=true,gunMode='loop'}={}) {
    this.sampleManifest=sampleManifest;this.loadVoices=voices;this.loadTones=tones;this.gunMode=gunMode;
    this._sampleGeneration=0;
    this._cannonSources=[];this._cannonOn=false;this._nextCannonAt=0;
    this.ctx = null;
    // Global headroom trim: the mixed WT samples are hotter than the old
    // synthesised bed, so lower the whole game output by 25%.
    this.outputTrim = 0.75;
    this.ready = false;
    this.muted = false;
    this.volume = 0.62;
    this.engineVolume = 0.80;
    this.alertVolume = 0.80;
    this.lastRwrNew = 0;
    this._nodes = {};
    this._time = 0;
    this.samples = {};
    this._external = { engine: null, gun: null };
    this.voiceBuffers = {};
    this.voicePack = 'yuuka';
    this.voiceStatus = 'idle';
    this._voiceGeneration = 0;
    this._voiceQueue = [];
    this._voiceCurrent = null;
    this._voiceNext = new Map();
    this.voiceHistory = [];
    this._voicePackPromise = null;
    this._voiceSource = null;
    this.wtToneBuffers = {};
    this._wtTonePromise = null;
    this._wtLoops = null;
    this._toneNext = {};
    this.wtToneFilter = null;
  }

  _playTimedTone(key, gain, interval) {
    const buffer = this.wtToneBuffers[key];
    if (!buffer || !this.alertBus) return;
    if (this._time < (this._toneNext[key] ?? 0)) return;
    this._toneNext[key] = this._time + interval;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.wtToneFilter || this.alertBus);
    src.start();
  }

  _loadWtTones() {
    if (this._wtTonePromise || !this.ctx || !this.loadTones) return this._wtTonePromise;
    this._wtTonePromise = (async () => {
      const response = await fetch(audioUrl('audio/wt-gui/manifest.json'), {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('战雷电子音效清单加载失败');
      const keys = await response.json();
      await Promise.all(keys.map(async (key) => {
        try {
          let response = await fetch(audioUrl(`audio/wt-gui/${key}.wav`), {
            cache: 'no-store',
          });
          if (!response.ok) {
            response = await fetch(audioUrl(`audio/wt-gui/${key}.ogg`), {
              cache: 'no-store',
            });
          }
          if (!response.ok) return;
          const data = await response.arrayBuffer();
          this.wtToneBuffers[key] = await this.ctx.decodeAudioData(data);
        } catch { /* optional tone */ }
      }));
      this._buildWtToneLoops();
    })().catch(error => {
      this._wtTonePromise = null;
      throw error;
    });
    // init() starts the request before Game.start() awaits it.
    this._wtTonePromise.catch(() => {});
    return this._wtTonePromise;
  }

  _buildWtToneLoops() {
    const ctx = this.ctx;
    if (!ctx || !this.alertBus) return;
    const roles = {
      // WT GUI event tones. The 8 s heatseeker loops are seeker growls, not
      // the clean lock "beep"; use the GUI track/capture tones instead.
      lockTrack: 'con_scan_track-001',
      lockCapture: 'con_scan_capture-001',
      rwrSearch: 'spin_scan_track-001',
      rwrLock: 'radar_lock',
      warnRocket: 'alarm_rocket-001',
      warnOverload: 'alarm_overload-001',
    };
    const missing = [...Object.values(roles), 'alarm_wep', 'click']
      .filter(key => !this.wtToneBuffers[key]);
    if (missing.length) throw new Error(`战雷电子音效加载／解码失败：${missing.join(', ')}`);
    const toneFilter = ctx.createBiquadFilter();
    toneFilter.type = 'lowpass';
    toneFilter.frequency.value = 4200;
    toneFilter.Q.value = 0.65;
    toneFilter.connect(this.alertBus);
    this.wtToneFilter = toneFilter;
    const loops = {};
    for (const [role, key] of Object.entries(roles)) {
      const buffer = this.wtToneBuffers[key];
      if (!buffer) continue;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(gain).connect(toneFilter);
      src.start();
      loops[role] = { src, gain };
    }
    loops.ready = Object.keys(loops).length > 0;
    this._wtLoops = loops;
  }

  async setVoicePack(id) {
    id = VOICE_PACKS[id] ? id : 'yuuka';
    if (id === this.voicePack) return this._loadVoicePack();
    this.stopVoice();
    this.voicePack = id;
    this._voiceGeneration++;
    this.voiceBuffers = {};
    this._voicePackPromise = null;
    this._voiceNext.clear();
    return this._loadVoicePack();
  }

  _loadVoicePack() {
    if (this._voicePackPromise || !this.ctx || !this.loadVoices) return this._voicePackPromise;
    const generation = this._voiceGeneration;
    const base = VOICE_PACKS[this.voicePack].path;
    this.voiceStatus = 'loading';
    this._voicePackPromise = (async () => {
      try {
        const response = await fetch(audioUrl(`${base}/manifest.json`), { cache: 'no-store' });
        if (!response.ok) throw new Error('voice manifest unavailable');
        const keys = await response.json();
        const buffers = {};
        await Promise.all(keys.map(async (key) => {
          try {
            const response = await fetch(audioUrl(`${base}/${key}.wav`), { cache: 'no-store' });
            if (response.ok) buffers[key] = await this.ctx.decodeAudioData(
              await response.arrayBuffer());
          } catch { /* Each pack keeps its own missing-phrase silence. */ }
        }));
        if (generation !== this._voiceGeneration) return;
        for (const [key, sample] of Object.entries(VOICE_PACKS[this.voicePack].aliases || {})) {
          if (!buffers[key] && buffers[sample]) buffers[key] = buffers[sample];
        }
        this.voiceBuffers = buffers;
        this.voiceStatus = keys.length && keys.every(key => !!buffers[key]) ? 'ready' : 'unavailable';
      } catch {
        if (generation === this._voiceGeneration) this.voiceStatus = 'unavailable';
      }
      if (generation === this._voiceGeneration && this.voiceStatus === 'unavailable') {
        this._voicePackPromise = null;
      }
    })();
    return this._voicePackPromise;
  }

  stopVoice() {
    const current = this._voiceCurrent;
    this._voiceCurrent = null;
    this._voiceSource = null;
    this._voiceQueue = [];
    for (const source of current?.sources || []) {
      source.onended = null;
      try { source.stop(); } catch { /* already ended */ }
      source.disconnect();
    }
  }

  resetVoice() {
    this.stopVoice();
    this._voiceNext.clear();
  }

  _startVoiceCue(cue) {
    const now = this.ctx.currentTime;
    let offset = 0;
    cue.sources = [];
    this._voiceCurrent = cue;
    for (const key of cue.keys) {
      const buffer = this.voiceBuffers[key];
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      const gain = this.ctx.createGain();
      gain.gain.value = 1;
      source.connect(gain).connect(this.alertBus);
      source.start(now + offset);
      offset += buffer.duration + cue.gap;
      cue.sources.push(source);
    }
    this._voiceSource = cue.sources.at(-1);
    this._voiceSource.onended = () => {
      if (this._voiceCurrent !== cue) return;
      for (const source of cue.sources) source.disconnect();
      this._voiceCurrent = null;
      this._voiceSource = null;
      this._drainVoiceQueue();
    };
    this.voiceHistory.push({ keys: cue.keys, at: now, pack: this.voicePack,
      samples: cue.keys.map(key => VOICE_PACKS[this.voicePack].aliases?.[key] || key) });
    if (this.voiceHistory.length > 40) this.voiceHistory.shift();
  }

  _drainVoiceQueue() {
    if (this.muted || this._voiceCurrent) return;
    this._voiceQueue = this._voiceQueue.filter(cue => cue.expires > this.ctx.currentTime);
    this._voiceQueue.sort((a, b) => b.level - a.level);
    const next = this._voiceQueue.shift();
    if (next) this._startVoiceCue(next);
  }

  playVoice(key, options = {}) {
    return this.playSequence([key], { ...options, gap: 0 });
  }

  playSequence(keys, { gap = 0.12, priority = false, cooldown = 4, id } = {}) {
    if (this.muted || !this.ctx || !this.alertBus) return false;
    if (!this.voiceBuffers[keys[0]]) return false;
    keys = keys.filter(key => !!this.voiceBuffers[key]);
    if (!keys.length) return false;
    const signature = id || keys.join('|');
    const now = this.ctx.currentTime;
    if (now < (this._voiceNext.get(signature) ?? -1)) return false;
    const levels = { vws_pull_up: 100, vws_missile: 90, rwr_missile: 90, rwr_lock: 65,
      vws_critical_altitude: 85, vws_critical_angle: 80,
      vws_check_gear: 75, vws_lock: 60, vws_over_g: 70 };
    const level = typeof priority === 'number' ? priority
      : (levels[keys[0]] ?? (priority ? 40 : 10));
    const cue = { keys, signature, level, gap, expires: now + 3 };
    this._voiceQueue = this._voiceQueue.filter(item => item.expires > now);
    if (this._voiceCurrent?.signature === signature ||
      this._voiceQueue.some(item => item.signature === signature)) return false;
    if (this._voiceCurrent && level > this._voiceCurrent.level) {
      this.stopVoice();
    }
    if (this._voiceCurrent) {
      this._voiceQueue.push(cue);
      this._voiceQueue.sort((a, b) => b.level - a.level);
      if (this._voiceQueue.length > 5 && this._voiceQueue.pop() === cue) return false;
    } else {
      this._startVoiceCue(cue);
    }
    this._voiceNext.set(signature, now + cooldown);
    return true;
  }

  callout(key, text, options = {}) {
    return this.playVoice(key, options);
  }

  init() {
    if (this.ready) {
      this.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -15;
    compressor.knee.value = 18;
    compressor.ratio.value = 7;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.3;
    compressor.connect(ctx.destination);

    const master = ctx.createGain();
    master.gain.value = this.volume * this.outputTrim;
    master.connect(compressor);
    this.master = master;

    const engineBus = ctx.createGain();
    engineBus.gain.value = Math.pow(this.engineVolume, 2);
    engineBus.connect(master);
    this.engineBus = engineBus;

    const alertBus = ctx.createGain();
    alertBus.gain.value = Math.sqrt(this.alertVolume) * 1.5;
    alertBus.connect(master);
    this.alertBus = alertBus;

    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = noiseBuffer;

    this._buildEngine();
    this._buildWind();
    this._buildGun();
    this._buildTones();
    this.ready = true;
    if(this.loadVoices)this._loadVoicePack();
    if(this.loadTones)this._loadWtTones();
    this._externalPromise = this._loadExternalSamples();
  }

  /**
   * Decode the local sample manifest. Missing samples retain the procedural
   * fallback; selected voice packs never fall back to another speaker or TTS.
   */
  async _loadExternalSamples() {
    const generation=this._sampleGeneration;
    let files = {};
    try {
      const manifest = await fetch(audioUrl(this.sampleManifest), { cache: 'no-store' });
      if (!manifest.ok) return;
      const json = await manifest.json();
      files = json.files || {};
    } catch {
      return;
    }
    const entries = await Promise.all(Object.entries(files).map(async ([key, file]) => {
      try {
        const response = await fetch(audioUrl(`audio/${file}`), { cache: 'no-store' });
        if (!response.ok) return [key, null];
        const data = await response.arrayBuffer();
        return [key, await this.ctx.decodeAudioData(data)];
      } catch {
        return [key, null];
      }
    }));
    if(generation!==this._sampleGeneration)return;
    for (const [key, buffer] of entries) {
      if (buffer) this.samples[key] = buffer;
    }
    this._startExternalLoops();
  }

  setSampleProfile(manifest='audio/pack.json',gunMode='loop'){
    if(this.sampleManifest===manifest&&this.gunMode===gunMode)return this._externalPromise||Promise.resolve();
    this._sampleGeneration++;this._cannonOn=false;for(const item of this._cannonSources){try{item.src.stop();}catch{}}this._cannonSources=[];
    for(const item of Object.values(this._external)){if(!item)continue;try{item.src.stop();}catch{}item.gain?.disconnect();}
    this._external={engine:null,gun:null};this.samples={};this.sampleManifest=manifest;this.gunMode=gunMode;
    this._externalPromise=this.ctx?this._loadExternalSamples():Promise.resolve();return this._externalPromise;
  }

  _startExternalLoops() {
    const ctx = this.ctx;
    for (const role of ['engine', 'engineCruise', 'engineThrust',
      'engineCockpitLeft', 'engineCockpitRight', 'engineAfterburner']) {
      const buffer = this.samples[role];
      if (!buffer) continue;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      if (role === 'engineCockpitLeft' || role === 'engineCockpitRight') {
        const pan = ctx.createStereoPanner();
        pan.pan.value = role.endsWith('Left') ? -0.65 : 0.65;
        src.connect(pan).connect(gain);
      } else src.connect(gain);
      gain.connect(this.engineBus);
      src.start();
      this._external[role] = { src, gain };
    }
  }

  _updateExternalGun(on, now) {
    if (!this.samples.gun) return;
    if(this.gunMode==='shots'){this._updateSampledCannon(on,now);return;}
    let gun = this._external.gun;
    if (on && (!gun || gun.stopping)) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.samples.gun;
      src.loop = true;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      src.connect(gain).connect(this.master);
      src.start();
      gun = this._external.gun = { src, gain };
      src.onended = () => { src.disconnect(); gain.disconnect(); };
    }
    if (gun && !gun.stopping) {
      gun.gain.gain.setTargetAtTime(on ? 0.60 : 0, now, 0.012);
      if (!on) {
        gun.stopping = true;
        gun.src.stop(now + 0.09);
      }
    }
  }

  _updateSampledCannon(on,now){
    const shot=(key,at,gain=.28)=>{const src=this.ctx.createBufferSource(),g=this.ctx.createGain();src.buffer=this.samples[key]||this.samples.gun;g.gain.value=gain;src.connect(g).connect(this.master);src.start(at);const item={src,g,at};this._cannonSources.push(item);src.onended=()=>{src.disconnect();g.disconnect();this._cannonSources=this._cannonSources.filter(s=>s!==item);};};
    if(on&&!this._cannonOn){shot('gunFirst',now);this._nextCannonAt=now+1/30;}
    if(on){this._nextCannonAt=Math.max(this._nextCannonAt,now);while(this._nextCannonAt<now+.035){shot('gun',this._nextCannonAt);this._nextCannonAt+=1/30;}}
    if(!on&&this._cannonOn){for(const s of this._cannonSources)if(s.at>now){try{s.src.stop();}catch{}}shot('gunLast',now,.22);}
    this._cannonOn=on;
  }

  _playSample(key, level = 1, duration = 0) {
    const buffer = this.samples[key];
    if (!buffer) return false;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = level;
    src.connect(gain).connect(this.master);
    src.start();
    if (duration > 0) src.stop(ctx.currentTime + duration);
    return true;
  }

  _noiseSource() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    return src;
  }

  _buildEngine() {
    const ctx = this.ctx;
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0.0;
    engineGain.connect(this.engineBus);

    const roar = this._noiseSource();
    const roarFilter = ctx.createBiquadFilter();
    roarFilter.type = 'lowpass';
    roarFilter.frequency.value = 380;
    roarFilter.Q.value = 1.1;
    const roarGain = ctx.createGain();
    roarGain.gain.value = 0.1;
    roar.connect(roarFilter).connect(roarGain).connect(engineGain);

    const body = ctx.createOscillator();
    body.type = 'sawtooth';
    body.frequency.value = 58;
    const bodyFilter = ctx.createBiquadFilter();
    bodyFilter.type = 'lowpass';
    bodyFilter.frequency.value = 220;
    const bodyGain = ctx.createGain();
    bodyGain.gain.value = 0.05;
    body.connect(bodyFilter).connect(bodyGain).connect(engineGain);

    const turbine = ctx.createOscillator();
    turbine.type = 'sine';
    turbine.frequency.value = 880;
    const turbineGain = ctx.createGain();
    turbineGain.gain.value = 0.018;
    turbine.connect(turbineGain).connect(engineGain);

    // Low compressor core and a faint second turbine harmonic add the weight
    // and whine that a single sawtooth cannot provide.
    const core = ctx.createOscillator();
    core.type = 'triangle';
    core.frequency.value = 34;
    const coreGain = ctx.createGain();
    coreGain.gain.value = 0.018;
    core.connect(coreGain).connect(engineGain);

    const whine = ctx.createOscillator();
    whine.type = 'sine';
    whine.frequency.value = 1620;
    const whineGain = ctx.createGain();
    whineGain.gain.value = 0.006;
    whine.connect(whineGain).connect(engineGain);

    const ab = this._noiseSource();
    const abFilter = ctx.createBiquadFilter();
    abFilter.type = 'bandpass';
    abFilter.frequency.value = 240;
    abFilter.Q.value = 0.55;
    const abGain = ctx.createGain();
    abGain.gain.value = 0.0;
    ab.connect(abFilter).connect(abGain).connect(this.engineBus);

    const abRumble = this._noiseSource();
    const abRumbleFilter = ctx.createBiquadFilter();
    abRumbleFilter.type = 'lowpass';
    abRumbleFilter.frequency.value = 135;
    const abRumbleGain = ctx.createGain();
    abRumbleGain.gain.value = 0;
    abRumble.connect(abRumbleFilter).connect(abRumbleGain).connect(this.engineBus);

    roar.start();
    body.start();
    turbine.start();
    core.start();
    whine.start();
    ab.start();
    abRumble.start();

    this._nodes.engine = {
      gain: engineGain, roar, roarFilter, roarGain, body, bodyGain,
      turbine, turbineGain, core, coreGain, whine, whineGain,
      ab, abFilter, abGain, abRumble, abRumbleGain,
    };
  }

  _buildWind() {
    const ctx = this.ctx;
    const wind = this._noiseSource();
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    wind.connect(filter).connect(gain).connect(this.master);
    wind.start();
    this._nodes.wind = { wind, filter, gain };

    // Airframe buffet is a separate low-frequency rumble so the wind layer can
    // remain clean at high alpha.
    const buffet = this._noiseSource();
    const buffetFilter = ctx.createBiquadFilter();
    buffetFilter.type = 'lowpass';
    buffetFilter.frequency.value = 95;
    const buffetGain = ctx.createGain();
    buffetGain.gain.value = 0;
    buffet.connect(buffetFilter).connect(buffetGain).connect(this.master);
    buffet.start();
    this._nodes.buffet = { buffet, buffetFilter, buffetGain };
  }

  _buildGun() {
    const ctx = this.ctx;
    const gunGain = ctx.createGain();
    gunGain.gain.value = 0;
    gunGain.connect(this.master);

    const noise = this._noiseSource();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1250;
    bp.Q.value = 0.75;
    const ng = ctx.createGain();
    ng.gain.value = 0.7;
    noise.connect(bp).connect(ng).connect(gunGain);

    const thump = ctx.createOscillator();
    thump.type = 'sawtooth';
    thump.frequency.value = 92;
    const tg = ctx.createGain();
    tg.gain.value = 0.22;
    thump.connect(tg).connect(gunGain);

    noise.start();
    thump.start();
    this._nodes.gun = { gain: gunGain, bp, thump };
  }

  _buildTones() {
    const ctx = this.ctx;
    // Ambient airframe noise remains procedural; electronic alerts use WT samples.
    const ambience = this._noiseSource();
    const ambFilter = ctx.createBiquadFilter();
    ambFilter.type = 'lowpass';
    ambFilter.frequency.value = 200;
    const ambGain = ctx.createGain();
    ambGain.gain.value = 0.004;
    ambience.connect(ambFilter).connect(ambGain).connect(this.master);
    ambience.start();
    this._nodes.ambience = { ambience, ambGain };
  }

  resume() {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  suspend() {
    if (!this.ctx) return;
    if (this.ctx.state === 'running') this.ctx.suspend();
  }

  setMuted(muted) {
    this.muted = muted;
    if (muted) this.stopVoice();
    if (muted && typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (this.master) {
      this.master.gain.setTargetAtTime(
        muted ? 0 : this.volume * this.outputTrim,
        this.ctx.currentTime, 0.05);
    }
  }

  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.master && !this.muted) {
      this.master.gain.setTargetAtTime(
        this.volume * this.outputTrim, this.ctx.currentTime, 0.05);
    }
  }

  setEngineVolume(volume) {
    this.engineVolume = Math.max(0, Math.min(1, volume));
    if (this.engineBus) {
      this.engineBus.gain.setTargetAtTime(
        Math.pow(this.engineVolume, 2), this.ctx.currentTime, 0.05);
    }
  }

  setAlertVolume(volume) {
    this.alertVolume = Math.max(0, Math.min(1, volume));
    if (this.alertBus) {
      this.alertBus.gain.setTargetAtTime(
        Math.sqrt(this.alertVolume) * 1.5, this.ctx.currentTime, 0.05);
    }
  }

  update(dt, state) {
    if (!this.ready) return;
    this._time += dt;
    const now = this.ctx.currentTime;
    const nodes = this._nodes;
    const spool = Math.max(0, Math.min(1.1, state.spool ?? 0.8));
    const ab = Math.max(0, Math.min(1, state.afterburner ?? 0));
    const speed = state.tas ?? 0;
    const altitude = state.altitude ?? 1000;
    const densityFactor = Math.max(0.18, Math.exp(-altitude / 11000));

    // Turbofan mix: quieter low-frequency roar, more compressor/turbine whine.
    const sampledEngine = !!(this._external.engine || this._external.engineCruise);
    const engineLevel = sampledEngine ? 0 : 0.1 + spool * 0.3;
    nodes.engine.gain.gain.setTargetAtTime(engineLevel, now, 0.08);
    nodes.engine.roarFilter.frequency.setTargetAtTime(
      170 + spool * 520 + ab * 180, now, 0.12);
    nodes.engine.body.frequency.setTargetAtTime(
      42 + spool * 26 + ab * 7, now, 0.2);
    nodes.engine.turbine.frequency.setTargetAtTime(
      520 + spool * 1750 + ab * 320, now, 0.15);
    nodes.engine.turbineGain.gain.setTargetAtTime(
      (0.011 + spool * 0.018) * densityFactor + 0.002, now, 0.15);
    nodes.engine.core.frequency.setTargetAtTime(
      24 + spool * 18 + ab * 5, now, 0.2);
    nodes.engine.coreGain.gain.setTargetAtTime(
      (0.008 + spool * 0.015) * densityFactor, now, 0.15);
    nodes.engine.whine.frequency.setTargetAtTime(
      760 + spool * 1750 + ab * 340, now, 0.12);
    nodes.engine.whineGain.gain.setTargetAtTime(
      (0.0035 + spool * 0.008) * densityFactor, now, 0.15);
    nodes.engine.abGain.gain.setTargetAtTime(
      (sampledEngine ? 0 : ab * 0.12 * densityFactor), now, 0.15);
    nodes.engine.abFilter.frequency.setTargetAtTime(
      150 + ab * 420, now, 0.15);
    nodes.engine.abRumbleGain.gain.setTargetAtTime(
      (sampledEngine ? 0 : ab * 0.045 * densityFactor), now, 0.15);

    // Wind was dominating the mix at normal cruise speeds. Keep it audible as
    // airframe noise but well under the engine and crew alerts.
    const windLevel = Math.min(0.028, Math.pow(speed / 340, 2.4) * 0.024) *
      (1 - ab * 0.20);
    nodes.wind.gain.gain.setTargetAtTime(windLevel, now, 0.2);
    nodes.wind.filter.frequency.setTargetAtTime(
      420 + speed * 2.5, now, 0.15);
    const buffet = clamp01(state.buffet ?? 0);
    nodes.buffet.buffetGain.gain.setTargetAtTime(
      buffet * 0.012 * (1 - ab * 0.2), now, 0.08);

    const active = clamp01(spool / 0.15);
    const high = clamp01((spool - 0.45) / 0.55);
    const cockpit = state.cockpit ? 1 : 0;
    const duck = this._voiceCurrent ? 0.68 : 1;
    const levels = {
      engine: 0.20 + spool * 0.20 + ab * 0.10,
      engineCruise: 0.42 * (1 - high * 0.65) * (1 - cockpit * 0.80),
      engineThrust: 0.46 * high * (1 - cockpit * 0.80),
      engineCockpitLeft: (0.12 + spool * 0.20) * (0.12 + cockpit * 0.88),
      engineCockpitRight: (0.12 + spool * 0.20) * (0.12 + cockpit * 0.88),
      engineAfterburner: ab * 0.26 * (1 - cockpit * 0.45),
    };
    for (const [role, level] of Object.entries(levels)) {
      const loop = this._external[role];
      if (!loop) continue;
      loop.gain.gain.setTargetAtTime(level * active * duck, now, 0.12);
      loop.src.playbackRate.setTargetAtTime(
        role === 'engineAfterburner' ? 0.94 + ab * 0.1 : 0.74 + spool * 0.30,
        now, 0.18);
    }

    const gunLevel = state.gunFiring && !this.samples.gun ? 0.7 : 0;
    nodes.gun.gain.gain.setTargetAtTime(gunLevel, now, 0.016);
    this._updateExternalGun(!!state.gunFiring, now);
    nodes.gun.thump.frequency.setTargetAtTime(
      88 + (state.gunRate ?? 100) * 0.16, now, 0.02);

    const wt = this._wtLoops;
    if (this.loadTones && wt && wt.ready) {
      // Play the short WT events as clean one-shots on a timer instead of
      // loop-boundary gating. The samples have attack/release envelopes, so a
      // repeated one-shot sounds like the in-game beep without loop clicks.
      const lockOn = !!state.lockTone;
      const radarLock = state.lockSeeker === 'radar';
      if (lockOn && state.lockProgress < 1) {
        this._playTimedTone('con_scan_track-001', 0.020, 0.56);
      } else if (lockOn && radarLock) {
        // Active-radar / SARH lock (AIM-120C, AIM-7): use WT's radar lock beep,
        // not the IR seeker capture tone.
        this._playTimedTone('radar_lock', 0.026, 0.50);
      } else if (lockOn) {
        this._playTimedTone('con_scan_capture-001', 0.026, 0.46);
      }
      if (state.rwrMissile) {
        // WT's rocket-warning alarm doubles as the missile-lock tone.
        this._playTimedTone('alarm_rocket-001', 0.034, 0.78);
      } else if (state.warning) {
        this._playTimedTone(
          state.warningLevel === 'danger'
            ? 'alarm_rocket-001' : 'alarm_overload-001',
          state.warningLevel === 'danger' ? 0.034 : 0.022, 0.62);
      }
      if (!state.rwrMissile && state.rwrLocked) {
        this._playTimedTone('radar_lock', 0.024, 0.55);
      } else if (!state.rwrMissile && state.rwrSearch) {
        this._playTimedTone('spin_scan_track-001', 0.016, 1.15);
      }
    }

    if (state.rwrNewAt > 0 && state.rwrNewAt !== this.lastRwrNew) {
      this.lastRwrNew = state.rwrNewAt;
      this.rwrNew();
    }
  }

  _mechanical(duration, frequency, noiseFrequency, level) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(frequency, now);
    osc.frequency.exponentialRampToValueAtTime(frequency * 0.72, now + duration);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.0001, now);
    oscGain.gain.exponentialRampToValueAtTime(level, now + 0.04);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(oscGain).connect(this.master);

    const noise = this._noiseSource();
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = noiseFrequency;
    filter.Q.value = 1.2;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.0001, now);
    nGain.gain.exponentialRampToValueAtTime(level * 0.35, now + 0.03);
    nGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    noise.connect(filter).connect(nGain).connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.03);
    noise.start(now);
    noise.stop(now + duration + 0.03);
  }

  gearMove() {
    this._mechanical(1.7, 52, 280, 0.05);
  }

  flapMove() {
    this._mechanical(0.85, 96, 720, 0.035);
  }

  airbrakeMove() {
    this._mechanical(0.65, 142, 1250, 0.032);
  }

  rwrNew() {
    if (!this.ready || !this.loadTones) return;
    this._playTimedTone('alarm_wep', 0.05, 0.18);
  }

  gunFiring(on) {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    this._nodes.gun.gain.gain.setTargetAtTime(on && !this.samples.gun ? 0.7 : 0, now, 0.016);
    this._updateExternalGun(on, now);
  }

  missileLaunch() {
    if (!this.ready) return;
    if (this._playSample('missile', 0.5, 6.0)) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const src = this._noiseSource();
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.4;
    filter.frequency.setValueAtTime(160, now);
    filter.frequency.exponentialRampToValueAtTime(2200, now + 0.7);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.3);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(now);
    src.stop(now + 1.35);
  }

  explosion(distance = 100, strength = 1) {
    if (!this.ready) return;
    const attenuation = 1 / (1 + distance / 900);
    if (this._playSample('explosion',
      Math.min(0.8, 0.55 * strength * attenuation))) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const src = this._noiseSource();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1500, now);
    filter.frequency.exponentialRampToValueAtTime(90, now + 1.8);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(
      Math.min(0.8, 0.35 * strength * attenuation), now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(now);
    src.stop(now + 2.25);

    if (distance < 800) {
      const hit = ctx.createOscillator();
      hit.type = 'sine';
      hit.frequency.setValueAtTime(120, now);
      hit.frequency.exponentialRampToValueAtTime(38, now + 0.5);
      const hg = ctx.createGain();
      hg.gain.setValueAtTime(0.3 * strength * attenuation, now);
      hg.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
      hit.connect(hg).connect(this.master);
      hit.start(now);
      hit.stop(now + 0.85);
    }
  }

  flarePop() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const src = this._noiseSource();
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1800;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(now);
    src.stop(now + 0.24);
  }

  uiClick() {
    if (!this.ready || !this.loadTones) return;
    this._playTimedTone('click', 0.055, 0);
  }
}
