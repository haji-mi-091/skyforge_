import {createStoreModel} from '../visual/F16Stores.js';
import * as THREE from '../../vendor/three.module.js';
import { RenderEngine } from './RenderEngine.js';
import { Input } from './Input.js';
import {activeControlActions,eventKeyCodes} from '../data/controls.js';
import { MouseAim } from './MouseAim.js';
import { AudioEngine } from './Audio.js';
import { CockpitWarnings } from './CockpitWarnings.js';
import { World } from '../world/World.js';
import { Effects } from '../visual/Effects.js';
import { CameraRig } from '../visual/CameraRig.js';
import { JetModel } from '../visual/JetModel.js';
import {J16Jet} from '../visual/J16Jet.js';
import {J10CJet} from '../visual/J10CJet.js';
import {buildTaggedStore} from '../visual/J10CStores.js';
import { onCadMissileReady } from '../visual/CadMissileLibrary.js';
import { Hud, bindGroundSampler } from '../ui/Hud.js';
import { killFeedEntry, killWeaponName } from '../ui/killFeed.js';
import { Aircraft, CONTACT_HEIGHT } from '../sim/Aircraft.js';
import { AIPilot } from '../sim/AIPilot.js';
import { enemyWaveSpawns } from '../sim/enemySpawns.js';
import { CombatSystem } from '../sim/CombatSystem.js';
import {
  AIRCRAFT_TYPES, F16CM_BLOCK52, MIG29,
} from '../data/aircraft.js';
import { missileLoadoutFromPreset, STORE_TYPES, STATIONS,LOADOUT_JETS,hasLoadout,storeOffered } from '../data/hangar.js';
import { AIRBASE } from '../world/terrainData.js';
import {
  clamp, damp, smoothstep, DEG, RAD, quaternionFromAttitude,
  basisFromQuaternion,
} from '../sim/math.js';

const FIXED_STEP = 1 / 120;
// The game starts in C free look; C switches back to mouse-aim flying.
const FREE_LOOK_DEFAULT = true;
const MAX_STEPS = 16;
const _vaporPos = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _up = new THREE.Vector3();
const _right = new THREE.Vector3();
const _camPos = new THREE.Vector3();
const _look = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _posePos = new THREE.Vector3();
const _poseQuat = new THREE.Quaternion();
const _poseVel = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

const RADAR_RANGES = [10000, 25000, 50000, 100000];
const DEFAULT_RADAR_RANGE = 50000;
// Scale is a display zoom. The radar itself always searches out to 100 km.
const RADAR_WORK_RANGE = 100000;
// RWR-only enemy radar scan envelope: nose cone out to 200 km.
const RWR_SCAN_RANGE = 200000;
const RWR_SCAN_CONE = 60 * DEG;

const MODE_LABELS = {
  instant: '即时空战',
  runway: '跑道起飞',
  test: '性能试飞',
};

export class Game {
  constructor({ canvas, hudCanvas, screens }) {
    this.canvas = canvas;
    this.screens = screens;
    this.engine = new RenderEngine(canvas);
    this.hud = new Hud(hudCanvas);
    this.input = new Input(canvas);
    this.mouseAim = new MouseAim();
    this.audio = new AudioEngine();
    this.cockpitWarnings = new CockpitWarnings(this.audio);
    this.state = 'loading';
    this.ready = false;
    this.aircraftWarmJets = [];
    this.mode = 'instant';
    this.aircraftId = 'f16cm-block52';
    this.settings = screens.settingsState;
    this.time = 0;
    this.missionTime = 0;
    this.fps = 60;
    this.accumulator = 0;
    this.lastFrame = performance.now();
    this.lockCandidate = null;
    this.lockedTarget = null;
    this.lockProgress = 0;
    this.gunTarget = null;
    this.throttleTarget = 0.88;
    this.telemetryVisible = false;
    this.score = 0;
    this.kills = 0;
    this.killStreak = 0;
    this.lastKillTime = -99;
    this.peakG = 1;
    this.wave = 1;
    this.waveTimer = 0;
    this.waveState = 'waiting';
    this.hasTakenOff = false;
    this.killfeed = [];
    this.cockpitWarnings.reset();
    this.audio.resetVoice();
    this.statusFeed = [];
    this.destroyNoticeTimer = 0;
    this._lastHighGVoice = -99;
    this.warnings = [];
    this.incoming = [];
    this.hitMarker = 0;
    this.hintTimer = 18;
    this.gStress = 0;
    this.redout = 0;
    this.cameraMode = 'chase';
    this.freeLook = FREE_LOOK_DEFAULT;
    this.mapOpen = false;
    this.mouseLook = { dx: 0, dy: 0 };
    this.altMouse = false;
    this.viewYaw = 0;
    this.viewPitch = 0;
    this.viewReturnTimer = 0;
    this.aimHoldHeading = 0;
    this.aimHoldPitch = 0;
    this.aimInputs = { pitch: 0, roll: 0, yaw: 0 };
    this.deathTimer = 0;
    this.deathPosition = new THREE.Vector3();
    this.deathInfo = null;
    this.showcase = null;
    this.showcaseTrails = [];
    this.showcaseTime = 0;
    this.pendingLoadout = null;
    this.hangarView = { yaw: 0.0, pitch: 0.68, distance: 58 };
    this.hangarWeapons = null;
    this.hangarAircraftStores = null;
    this.hangarDrag = null;
    this._cockpitHudAnchor = new THREE.Vector3();
    this.radar = {
      range: DEFAULT_RADAR_RANGE,
      azimuth: 85 * DEG,
      elevation: 60 * DEG,
      scanAngle: -85 * DEG,
      scanDir: 1,
      contacts: [],
      contactPool: [],
    };
    this._seenRadarIds = new Set();
    this._lastRadarAlert = -99;
    this._lastRwrVoiceTime = -99;
    this._rwrWasTracked = false;
    this._rwrWasLocked = false;
    this._rwrMissileActive = false;
    this._missileVoiceTimer = 0;
    this.rwr = {
      threats: [], locked: false, tracked: false, search: false,
      missile: false, incoming: 0, newAt: -99,
    };
    this.rwrIds = new Set();
    this.nextTrackId = 1;
    this.enemyRecords = [];
    this.enemies = [];
    this.enemyPool = [];
    this.enemyPoolGroup = null;
    this.playerRecord = null;
    this.player = null;
    this.playerJet = null;
    this.combat = null;
    this.effects = null;
    this.world = null;
    this.cameraRig = null;
    this._showcasePose = null;

    this._onResize = () => this.hud.resize();
    window.addEventListener('resize', this._onResize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });
    window.addEventListener('blur', () => {
      if (this.state === 'playing') this.pause();
    });
    this.input.onPointerLockLost = () => {
      if (this.state === 'playing') this.pause();
    };
    window.addEventListener('keydown', (e) => this._onUiKeys(e), true);
    this._bindHangarPointer();
    bindGroundSampler((x, z) =>
      this.world ? this.world.groundHeight(x, z) : 0);
  }

  _bindHangarPointer() {
    const canDrag = (event) => {
      if (this.state !== 'menu') return false;
      if (!(event.target instanceof Element)) return false;
      if (event.target.closest('button, select, input, .hangar-panel, .modal-layer')) return false;
      return true;
    };
    document.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !canDrag(event)) return;
      this.hangarDrag = {
        x: event.clientX, y: event.clientY,
        yaw: this.hangarView.yaw, pitch: this.hangarView.pitch,
      };
      event.preventDefault();
    });
    window.addEventListener('pointermove', (event) => {
      if (!this.hangarDrag) return;
      const dx = event.clientX - this.hangarDrag.x;
      const dy = event.clientY - this.hangarDrag.y;
      this.hangarView.yaw = this.hangarDrag.yaw - dx * 0.006;
      // Hangar preview uses inverted vertical look: drag down to look up,
      // drag up to look down.
      this.hangarView.pitch = clamp(this.hangarDrag.pitch + dy * 0.0045,
        -1.18, 1.18);
    });
    const end = () => { this.hangarDrag = null; };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    document.addEventListener('wheel', (event) => {
      if (this.state !== 'menu') return;
      if (event.target.closest('.hangar-panel, .modal-layer')) return;
      event.preventDefault();
      this.hangarView.distance = clamp(
        this.hangarView.distance + Math.sign(event.deltaY) * 1.8, 10, 52);
    }, { passive: false });
  }

  async init() {
    const bootStart = performance.now();
    this.screens.setLoading(0.08, '初始化渲染器…');
    await frame();
    await this._preloadAircraft();
    this.screens.setLoading(0.2, '生成大气与光照…');
    await frame();
    this.world = new World(this.engine.renderer, this.engine.scene);
    this.screens.setLoading(0.6, '塑造岛屿地形与云层…');
    await frame();
    this.effects = new Effects(this.engine.scene);
    this.combat = new CombatSystem({
      scene: this.engine.scene,
      world: this.world,
      effects: this.effects,
      audio: this.audio,
      getAircraft: () => this.allAircraft(),
      getPlayer: () => this.player,
    });
    this.cameraRig = new CameraRig(this.engine.camera,
      (x, z) => this.world.groundHeight(x, z));
    this.engine.light = this.world.sky.light;
    this.applySettings(this.settings);
    this.screens.setLoading(0.88, '校准电传飞控与武器系统…');
    await frame();
    this.pendingLoadout = this.screens.getLoadout?.() || null;
    this._unsubscribeCadMissiles = onCadMissileReady(
      () => this._onCadMissilesReady());
    this._createShowcase();
    // All aircraft use the same startup warm-up, including the existing enemy pool.
    this.screens.setLoading(0.9, '预热飞机与特效资源…');
    await frame();
    this._createEnemyPool();
    await this._prewarmAircraftMaterials();
    await this.showcase?.ready;
    this._updateShowcase(0);
    this.screens.setLoading(1, '就绪');
    await frame();
    this.screens.hideLoading();
    this.screens.showMenu();
    this.screens.setStartEnabled(true);
    this.ready = true;
    this.state = 'menu';
    this.lastFrame = performance.now();
    this._loop = this._loop.bind(this);
    this.gearDebug = new URLSearchParams(location.search).has('gearDebug');
    this.gearDebugEl = null;
    console.info(`[SKYFORGE] world ready in ${(performance.now() - bootStart).toFixed(0)} ms`);
    requestAnimationFrame(this._loop);
  }

  async _preloadAircraft() {
    const jets = [], configs = Object.values(AIRCRAFT_TYPES);
    let completed = 0, failed = false;
    try {
      for (const original of configs) {
        const jet = this._createJet(structuredClone(original), false);
        jet.ready?.catch(() => {});
        jets.push(jet);
      }
      await Promise.all(jets.map(async (jet) => {
        try { await jet.ready; }
        catch (error) { throw new Error(jet.config.name + '模型加载失败：' + (error?.message || '资源请求失败')); }
        jet.group.visible = false;
        if (!failed) this.screens.setLoading(0.08 + .10 * ++completed / jets.length,
          `准备飞机资源 ${completed}/${jets.length} · ${jet.config.name}`);
      }));
      // Keep material/program references alive for the page lifetime. Runtime jets
      // use independent clones from modelCache, never these posed warm-up instances.
      this.aircraftWarmJets = jets;
    } catch (error) {
      failed = true;
      for (const jet of jets) jet.dispose();
      throw error;
    }
  }

  applySettings(settings) {
    // Preserve the shared settings object: Screens persists and edits the same
    // record, so replacing it here would make toggles such as V diverge.
    Object.assign(this.settings, settings);
    this.input.sensitivity = this.settings.sensitivity;
    this.input.invertY = !!this.settings.invertY;
    this.input.setBindings(this.settings.keyBindings);
    this.engine.setQuality(this.settings.quality);
    if (this.world) this.engine.light = this.world.sky.light;
    this.audio.setVolume(this.settings.volume);
    this.audio.setEngineVolume(this.settings.engineVolume ?? 0.8);
    this.audio.setAlertVolume(this.settings.alertVolume ?? 0.8);
    this.audio.setVoicePack(this.settings.voicePack || 'yuuka');
    this.audio.setMuted(!!this.settings.muted);
  }

  async start(mode = 'instant', aircraftId = this.aircraftId, loadout = null) {
    if (!this.ready) return;
    if(loadout){const error=LOADOUT_JETS[aircraftId]?.error(loadout);if(error){this.screens.toast(error,{tone:'danger',duration:3000});return;}}
    this.aircraftId = AIRCRAFT_TYPES[aircraftId]
      ? aircraftId : 'f16cm-block52';
    this.pendingLoadout = loadout;
    this.audio.init();
    this.audio.resume();
    const soundConfig=AIRCRAFT_TYPES[this.aircraftId].visual;
    this.screens.setStartEnabled(false);
    try {
      await Promise.all([
        this.audio.setSampleProfile(soundConfig.audioManifest||'audio/pack.json',soundConfig.gunMode||'loop'),
        this.audio._loadWtTones(),
        this.audio.setVoicePack(this.settings.voicePack || 'yuuka'),
      ]);
      while (this.audio.voiceStatus === 'loading') await this.audio._voicePackPromise;
      if (this.audio.ctx && this.audio.loadVoices && this.audio.voiceStatus !== 'ready') {
        throw new Error('所选人声采样加载失败，请重试');
      }
    } catch (error) {
      this.screens.toast(`音效加载失败：${error.message}`, {tone:'danger',duration:6000});
      this.screens.setStartEnabled(true);
      return;
    }
    this._removeShowcase();
    this._teardownFlight();
    this.mode = mode;
    this.score = 0;
    this.kills = 0;
    this.killStreak = 0;
    this.lastKillTime = -99;
    this.destroyNoticeTimer = 0;
    this._lastHighGVoice = -99;
    this.peakG = 1;
    this.wave = 1;
    this.waveTimer = 0;
    this.waveState = mode === 'test' ? 'inactive' : 'waiting';
    this.missionTime = 0;
    this.killfeed = [];
    this.cockpitWarnings.reset();
    this.audio.resetVoice();
    this.nextTrackId = 1;
    this.rwr = {
      threats: [], locked: false, tracked: false, search: false,
      missile: false, incoming: 0, newAt: -99,
    };
    this.rwrIds = new Set();
    this.radar.contacts = [];
    this.radar.range = DEFAULT_RADAR_RANGE;
    this.radar.azimuth = 85 * DEG;
    this.radar.elevation = 60 * DEG;
    this.radar.scanAngle = -85 * DEG;
    this.radar.scanDir = 1;
    this._seenRadarIds.clear();
    this._lastRadarAlert = -99;
    this._lastRwrVoiceTime = -99;
    this._rwrWasTracked = false;
    this._rwrWasLocked = false;
    this._rwrMissileActive = false;
    this._missileVoiceTimer = 0;
    this.statusFeed = [];
    this.hintTimer = 18;
    this.gStress = 0;
    this.redout = 0;
    this.hitMarker = 0;
    this.lockCandidate = null;
    this.lockedTarget = null;
    this.lockProgress = 0;
    this.gunTarget = null;
    this.telemetryVisible = mode === 'test';
    this.throttleTarget = mode === 'runway' ? 0 : 0.9;
    this.hasTakenOff = mode !== 'runway';
    this.cameraMode = 'chase';
    this.mapOpen = false;
    this.cameraRig.setMode('chase');
    this.cameraRig.reset();
    this._resetFreeLook();
    this.statusFeed = [];
    this.effects.clear();
    this.combat.reset();
    this._spawnPlayer(mode);
    if(this.playerJet?.ready){try{await this.playerJet.ready;}catch(error){this.screens.toast((AIRCRAFT_TYPES[this.aircraftId]?.name||'')+'模型加载失败：'+error.message,{tone:'danger',duration:6000});this.screens.setStartEnabled(true);this.state='menu';return;}}
    if (this.playerJet) this.playerJet.setCockpitView(false);
    this.screens.enterFlight();
    this.input.setEnabled(true);
    this.input.clear();
    this._resetAltMouse();
    this.input.requestPointerLock();
    this.state = 'playing';
    window.setTimeout(() => {
      if (this.state === 'playing' && !this.input.pointerLocked && !this.altMouse) {
        this.screens.toast('点击画面锁定鼠标 · ' + this.input.bindingLabel('mouseCapture') + ' 可呼出鼠标', { duration: 2600 });
      }
    }, 900);
    this.accumulator = 0;
    this.lastFrame = performance.now();
    this.fps = 60;
    this.screens.toast(
      mode === 'runway' ? `滑跑起飞：${this.input.bindingLabel('throttleUp')} 加力 · 到速度后按 ${this.input.bindingLabel('pitchUp')} 抬头` :
        mode === 'test' ? `试飞模式：${this.input.bindingLabel('telemetry')} 遥测 · ${this.input.bindingLabel('pitchLadder')} 姿态线 · ${this.input.bindingLabel('freeLook')} 切换自由视角` :
          `鼠标转动视角 · ${this.input.bindingLabel('gunFire')} 机炮 · ${this.input.bindingLabel('weaponFire')} 锁定/发射/投弹 · ${this.input.bindingLabel('jettisonTanks')} 抛副油箱`,
      { duration: 4200 });
    if (this.mode !== 'test') {
      this.waveState = 'waiting';
      this.waveTimer = mode === 'runway' ? 1.5 : 3.5;
    }
    this.screens.setStartEnabled(true);
  }

  _spawnPlayer(mode, { forceAir = false } = {}) {
    this.playerView = null;
    this.playerViewSource = null;
    this.visualAlpha = 0;
    const spawn = forceAir ? this.world.spawns.air :
      mode === 'runway' ? this.world.spawns.runway :
        mode === 'test' ? this.world.spawns.test : this.world.spawns.air;
    const onGround = mode === 'runway' && !forceAir;
    let config = AIRCRAFT_TYPES[this.aircraftId] || F16CM_BLOCK52;
    const activeLoadout=this.pendingLoadout||LOADOUT_JETS[this.aircraftId]?.presets[0].loadout;
    if (hasLoadout(this.aircraftId) && activeLoadout) {
      config = structuredClone(config);
      config.visual.loadout = activeLoadout;
      config.armament.missileLoadout = missileLoadoutFromPreset(
        { loadout: activeLoadout }, config);
    }
    // The player owns its config (belt selection, muzzle position and paint change at runtime).
    if(config===AIRCRAFT_TYPES[this.aircraftId])config=structuredClone(config);
    const paint=this.screens.getPaint?.(this.aircraftId);
    if(paint)config.visual.paint=paint;
    this.player = new Aircraft(config, {
      isPlayer: true, team: 'blue', callsign: config.visual.callsign,
      selfDamage: false,
    });
    this.player.reset(spawn, { onGround });
    this.viewYaw = this.player.flight.heading * DEG;
    this.viewPitch = this.player.flight.pitch * DEG;
    this.viewReturnTimer = 0;
    this.playerJet = this._createJet(config,true);
    this.player.visual = this.playerJet;
    this.engine.scene.add(this.playerJet.group);
    const trails = this._createVaporTrails(this.effects);
    this.playerRecord = {
      aircraft: this.player, jet: this.playerJet, trails,
      smokeTimer: 0, isPlayer: true,
    };
    this.player.throttleTarget = this.throttleTarget;
    this.playerJet.sync(FIXED_STEP, this.player.flight, this.player.systems,
      this.player.weapons, { cockpit: false });
  }

  _teardownFlight() {
    if (this.combat) this.combat.reset();
    if (this.effects) this.effects.clear();
    for (const record of [this.playerRecord, ...this.enemyRecords]) {
      if (!record) continue;
      if (record.poolEntry) {
        // Enemy jets/trails belong to the persistent pool; hide and reuse.
        this._releaseEnemyResources(record);
      } else if (record.jet) {
        this.engine.scene.remove(record.jet.group);
        record.jet.dispose();
      }
      record.trails = [];
    }
    this.playerRecord = null;
    this.enemyRecords = [];
    this.enemies = [];
    this.player = null;
    this.playerJet = null;
    this.playerView = null;
    this.playerViewSource = null;
    this.visualAlpha = 0;
    this.mapOpen = false;
    this._resetFreeLook();
    this.lockCandidate = null;
    this.lockedTarget = null;
    this.lockProgress = 0;
    this.gunTarget = null;
    this.input.setEnabled(false);
  }

  _createVaporTrails(effects, persistent = false) {
    return [0, 1].map(() => effects.createTrail({
      maxPoints: 100,
      width: 0.16,
      color: '#eef8fb',
      opacity: 0.0,
      lifetime: 1.1,
      minSegment: 2.1,
    }, persistent));
  }

  _createEnemyPool() {
    if (this.enemyPool.length) return;
    this.enemyPoolGroup = new THREE.Group();
    this.enemyPoolGroup.name = 'enemy-pool';
    this.engine.scene.add(this.enemyPoolGroup);
    // Five is the maximum simultaneous wave size. Keeping the jets and their
    // trail buffers alive removes both spawn and kill-time GPU allocations.
    for (let i = 0; i < 5; i++) this._createEnemyPoolEntry();
  }

  async _prewarmAircraftMaterials() {
    // Render the actual gameplay scene with the island hidden: same lights,
    // fog, environment and shadow state as a real frame, so aircraft programmes
    // cache and textures match exactly. A separate "warm scene" recompiles as
    // soon as the real lights differ, which is precisely the first-contact
    // stall we are removing.
    const camera = this.engine.camera;
    const saved = {
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone(),
      up: camera.up.clone(),
      fov: camera.fov,
    };
    const hidden = [];
    const hide = (object) => {
      if (!object) return;
      hidden.push([object, object.visible]);
      object.visible = false;
    };
    hide(this.world.sky.group);
    hide(this.world.terrain.group);
    hide(this.world.ocean.group);
    hide(this.world.airbaseScene.group);
    hide(this.world.clouds.group);
    hide(this.showcase?.group);
    hide(this.showcaseLight);

    const savedJetState = [...this.aircraftWarmJets, ...this.enemyPool.map(entry => entry.jet)].map((jet) => {
      const group = jet.group;
      const state = {
        visible: group.visible,
        position: group.position.clone(),
        quaternion: group.quaternion.clone(),
        parent: group.parent,
      };
      group.visible = false;
      this.engine.scene.add(group);
      return { jet, state };
    });
    const trail = this.enemyPool[0].trails[0];
    const trailVisible = trail.mesh.visible;
    trail.mesh.visible = true;
    // First explosion would otherwise compile the sprite particle shader at
    // the exact moment a bandit dies.
    const spriteSaved = [];
    for (const pool of [this.effects.smoke, this.effects.sparks, this.effects.flashes]) {
      const sprite = pool.items[0].sprite;
      spriteSaved.push([sprite, sprite.visible, sprite.position.clone()]);
      sprite.visible = true;
      sprite.position.set(0, 2, 0);
    }

    camera.position.set(0, 7, 46);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 1.4, 0);
    camera.fov = 44;
    camera.updateProjectionMatrix();
    const flight = {position: new THREE.Vector3(), orientation: new THREE.Quaternion(),
      velocity: new THREE.Vector3(), control: {surfaces: {elevator: 0, aileron: 0, rudder: 0}},
      tas: 0, engineSpool: 1, afterburner: 1, air: {pressure: 101325}};
    try {
      for (let i = 0; i < savedJetState.length; i++) {
        const {jet} = savedJetState[i];
        this.screens.setLoading(.9 + .08 * i / savedJetState.length, '预热飞机材质 · ' + jet.config.name);
        await frame();
        jet.group.visible = true;
        const paints = jet.config.visual.paints?.options || [[jet.config.visual.paint]];
        for (const [paint] of paints) {
          jet.setPaint?.(paint);
          for (const cockpit of [false, true]) {
            jet.sync(0, flight, {gear: 1, flaps: 0, airbrake: 0, canopy: 0}, null,
              {cockpit, showcase: true, onGround: true, gunFiring: true});
            this.engine.renderer.render(this.engine.scene, camera);
          }
        }
        jet.setCockpitView(false);
        jet.group.visible = false;
      }
    } finally {
      for (const { jet, state } of savedJetState) {
        jet.group.position.copy(state.position);
        jet.group.quaternion.copy(state.quaternion);
        jet.group.visible = state.visible;
        if (state.parent) state.parent.add(jet.group);
        else this.engine.scene.remove(jet.group);
      }
      trail.mesh.visible = trailVisible;
      for (const [sprite, visible, position] of spriteSaved) {
        sprite.visible = visible;
        sprite.position.copy(position);
      }
      for (const [object, visible] of hidden) object.visible = visible;
      camera.position.copy(saved.position);
      camera.quaternion.copy(saved.quaternion);
      camera.up.copy(saved.up);
      camera.fov = saved.fov;
      camera.updateProjectionMatrix();
    }
  }

  _createEnemyPoolEntry() {
    const jet = new JetModel(MIG29, { isPlayer: false });
    jet.group.visible = false;
    this.enemyPoolGroup.add(jet.group);
    const trails = this._createVaporTrails(this.effects, true);
    for (const trail of trails) {
      trail.clear();
      trail.setOpacity(0);
    }
    const entry = { jet, trails, inUse: false };
    this.enemyPool.push(entry);
    return entry;
  }

  _acquireEnemyResources() {
    let entry = this.enemyPool.find((e) => !e.inUse);
    if (!entry) entry = this._createEnemyPoolEntry();
    entry.inUse = true;
    entry.jet.group.visible = true;
    for (const trail of entry.trails) {
      trail.clear();
      trail.setOpacity(0);
    }
    return entry;
  }

  _releaseEnemyResources(record) {
    const entry = record.poolEntry;
    if (!entry) return;
    entry.jet.group.visible = false;
    for (const trail of entry.trails) {
      trail.clear();
      trail.setOpacity(0);
    }
    entry.inUse = false;
    record.poolEntry = null;
  }

  setPreviewAircraft(aircraftId) {
    if (!AIRCRAFT_TYPES[aircraftId]) return;
    this.aircraftId = aircraftId;
    this.pendingLoadout = hasLoadout(aircraftId)
      ? (this.screens.getLoadout?.() || null) : null;
    if (this.ready && this.state === 'menu') {
      this._removeShowcase();
      this._createShowcase();
    }
  }

  setPreviewPaint(paint) {
    if (this.state === 'menu') this.showcase?.setPaint?.(paint);
  }

  setPreviewLoadout(loadout) {
    this.pendingLoadout = loadout;
    if (this.state === 'menu') {
      this.showcase?.setVisualLoadout?.(loadout);
      this._rebuildHangarAircraftStores();
    }
  }

  _createShowcase() {
    if (this.showcase) return;
    const config = structuredClone(
      AIRCRAFT_TYPES[this.aircraftId] || F16CM_BLOCK52);
    config.visual.loadout = this.pendingLoadout;
    config.visual.paint=this.screens.getPaint?.(this.aircraftId)||config.visual.paint;
    this.showcase = this._createJet(config,false);
    this.engine.scene.add(this.showcase.group);
    // Studio key light for the hangar preview; removed with the showcase.
    this.showcaseLight = new THREE.PointLight(0xffe7ca, 7.0, 120, 1.35);
    this.engine.scene.add(this.showcaseLight);
    this.showcaseTime = 0;
    this._showcasePose = {
      position: new THREE.Vector3(AIRBASE.x, this._showcaseOriginY(), AIRBASE.z),
      orientation: new THREE.Quaternion(),
      control: {
        surfaces: {
          elevator: 0, aileron: 0, rudder: 0,
          flaps: 0, gear: 1, airbrake: 0, stores: 1,
        },
      },
      afterburner: 0,
      engineSpool: 0,
    };
    this.showcaseTrails = [];
    this.hangarWeapons = this._createHangarWeapons();
    this.engine.scene.add(this.hangarWeapons);
    this.hangarAircraftStores = new THREE.Group();
    this.hangarAircraftStores.name = 'hangar-aircraft-stores';
    this.engine.scene.add(this.hangarAircraftStores);
    this._rebuildHangarAircraftStores();
    this.engine.camera.fov = 58;
    this.engine.camera.updateProjectionMatrix();
    this._showcaseInitialized = false;
  }

  _createHangarWeapons() {
    const group = new THREE.Group();
    group.name = 'hangar-weapons';
    const ground = this.world
      ? this.world.groundHeight(AIRBASE.x, AIRBASE.z) : AIRBASE.elevation;
    group.position.set(AIRBASE.x, ground + 0.05, AIRBASE.z);
    const stores = Object.values(STORE_TYPES).filter(s=>storeOffered(s,this.aircraftId));
    const rowZ = [-8.6, -5.2, -1.8, 1.8, 5.2, 8.6];
    const columnX = [8.6, 12.0, 15.4, 18.8];
    const tailAxis = new THREE.Vector3(0, 0, 1);
    // Mirror the complete catalogue onto both sides of the aircraft. All
    // weapon tails point toward the aircraft centreline; nothing floats or
    // rotates during the preview.
    for (const side of [-1, 1]) {
      for (let i = 0; i < stores.length; i++) {
        const store = stores[i];
        const column = Math.floor(i / rowZ.length);
        const row = i % rowZ.length;
        const x = side * (columnX[column]??(8.6+column*3.4));
        const z = rowZ[row];
        const y = Math.max(0.18, store.radius * 0.9);
        const mesh = this._createStoreMesh(store);
        mesh.position.set(x, y, z);
        const toCenter = new THREE.Vector3(-x, 0, -z).normalize();
        mesh.quaternion.setFromUnitVectors(tailAxis, toCenter);
        mesh.scale.setScalar(0.62);
        mesh.userData.storeId = store.id;
        group.add(mesh);
      }
    }
    return group;
  }

  _rebuildHangarAircraftStores() {
    const group = this.hangarAircraftStores;
    if (!group) return;
    while (group.children.length) {
      const child = group.children.pop();
      child.traverse?.((obj) => {
        obj.geometry?.dispose?.();
        obj.material?.map?.dispose?.();
        obj.material?.dispose?.();
      });
    }
    const loadout = this.pendingLoadout;
    // Registered aircraft show their stores on their own model rigs.
    if (!loadout || hasLoadout(this.aircraftId)) return;
    const positions = {
      lt: [-5.02, 0.18, 3.55], rt: [5.02, 0.18, 3.55],
      lo: [-3.82, -0.34, 3.30], ro: [3.82, -0.34, 3.30],
      li: [-2.35, -0.38, 2.90], ri: [2.35, -0.38, 2.90],
      ctr: [0, -0.74, 2.70],
    };
    for (const station of STATIONS) {
      const storeId = loadout[station.id];
      const store = STORE_TYPES[storeId];
      const pos = positions[station.id];
      if (!store || !pos) continue;
      const mesh = this._createStoreMesh(store);
      const drop = store.category === 'missile' ? 0.55 : 0.85;
      mesh.position.set(pos[0], pos[1] - drop, pos[2]);
      mesh.scale.setScalar(store.category === 'missile' ? 0.92 : 0.72);
      group.add(mesh);
      const pylon = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.52, 0.72),
        new THREE.MeshStandardMaterial({ color: 0x5b6258, roughness: 0.8 }));
      pylon.position.set(pos[0], pos[1] - drop * 0.45, pos[2]);
      group.add(pylon);
    }
    group.position.copy(this.showcase.group.position);
    group.quaternion.copy(this.showcase.group.quaternion);
  }

  _onCadMissilesReady() {
    if (this.state !== 'menu' || !this.showcase ||
      !this.hangarWeapons || !this.hangarAircraftStores) return;
    if (this.hangarWeapons) {
      this.engine.scene.remove(this.hangarWeapons);
      this.hangarWeapons.traverse((obj) => {
        obj.geometry?.dispose?.();
        obj.material?.map?.dispose?.();
        obj.material?.dispose?.();
      });
      this.hangarWeapons = null;
    }
    this.hangarWeapons = this._createHangarWeapons();
    this.engine.scene.add(this.hangarWeapons);
    this._rebuildHangarAircraftStores();
  }

  // Stores tagged with store.aircraft (own weapon sets) vs the generic F-16 catalogue.
  _createStoreMesh(store) { return store.aircraft?.length?buildTaggedStore(store.id):createStoreModel(store.id); }

  // Hangar showcase stands exactly where the physics parks the aircraft: the
  // real ground under the airbase plus the aircraft's own contact height.
  _showcaseOriginY() {
    const config = AIRCRAFT_TYPES[this.aircraftId] || F16CM_BLOCK52;
    const ground = this.world ? this.world.groundHeight(AIRBASE.x, AIRBASE.z) : AIRBASE.elevation;
    return ground + (config.systems.contactHeight ?? CONTACT_HEIGHT);
  }

  _createJet(config,isPlayer) {
    const Jet=config.id==='j16'?J16Jet:config.id==='j10c'?J10CJet:JetModel;
    return new Jet(config,{isPlayer});
  }

  _storeLabel(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(4, 16, 16, 0.72)';
    ctx.fillRect(0, 0, 256, 64);
    ctx.strokeStyle = 'rgba(185, 255, 214, 0.35)';
    ctx.strokeRect(1, 1, 254, 62);
    ctx.fillStyle = '#dff8e9';
    ctx.font = '600 22px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 34);
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture, transparent: true, depthWrite: false,
    }));
    sprite.scale.set(1.65, 0.42, 1);
    return sprite;
  }

  _removeShowcase() {
    if (this.showcase) {
      this.engine.scene.remove(this.showcase.group);
      this.showcase.dispose();
      this.showcase = null;
    }
    if (this.showcaseLight) {
      this.engine.scene.remove(this.showcaseLight);
      this.showcaseLight.dispose?.();
      this.showcaseLight = null;
    }
    if (this.hangarWeapons) {
      this.engine.scene.remove(this.hangarWeapons);
      this.hangarWeapons.traverse((obj) => {
        obj.geometry?.dispose?.();
        obj.material?.map?.dispose?.();
        obj.material?.dispose?.();
      });
      this.hangarWeapons = null;
    }
    if (this.hangarAircraftStores) {
      this.engine.scene.remove(this.hangarAircraftStores);
      this.hangarAircraftStores.traverse((obj) => {
        obj.geometry?.dispose?.();
        obj.material?.map?.dispose?.();
        obj.material?.dispose?.();
      });
      this.hangarAircraftStores = null;
    }
    for (const trail of this.showcaseTrails) this.effects.removeTrail(trail);
    this.showcaseTrails = [];
  }

  _updateShowcase(dt) {
    if (!this.showcase) return;
    this.showcaseTime += dt;
    const p = this._showcasePose;
    p.position.set(AIRBASE.x, this._showcaseOriginY(), AIRBASE.z);
    p.orientation.identity();
    p.control.surfaces.elevator = 0;
    p.control.surfaces.aileron = 0;
    p.control.surfaces.rudder = 0;
    let showcaseMissiles = 6;
    if (this.pendingLoadout) {
      showcaseMissiles = Object.values(this.pendingLoadout).reduce((sum, id) => {
        if (id === 'aim120c' || id === 'aim120c_chaff' ||
          id === 'aim9m' || id === 'aim9x' || id === 'aim9l' ||
          id === 'aim7m') sum += 1;
        return sum;
      }, 0);
    }
    this.showcase.sync(dt, p, { gear: 1, flaps: 0, airbrake: 0 },
      { missiles: showcaseMissiles, missileRemaining: {
        aim120c: Object.values(this.pendingLoadout || {})
          .filter((id) => id === 'aim120c' || id === 'aim120c_chaff').length,
        aim9m: Object.values(this.pendingLoadout || {})
          .filter((id) => id === 'aim9m' || id === 'aim9x' || id === 'aim9l').length,
        aim7m: Object.values(this.pendingLoadout || {})
          .filter((id) => id === 'aim7m').length,
      } }, { cockpit: false,showcase:true });
    this.showcase.group.updateMatrixWorld(true);
    if (this.hangarAircraftStores) {
      this.hangarAircraftStores.position.copy(this.showcase.group.position);
      this.hangarAircraftStores.quaternion.copy(this.showcase.group.quaternion);
    }

    const target = p.position;
    const yaw = this.hangarView.yaw;
    const pitch = this.hangarView.pitch;
    const distance = this.hangarView.distance;
    _camPos.set(
      target.x + Math.sin(yaw) * Math.cos(pitch) * distance,
      target.y + Math.sin(pitch) * distance,
      target.z + Math.cos(yaw) * Math.cos(pitch) * distance);
    const ground = this.world.groundHeight(_camPos.x, _camPos.z) + 2;
    if (_camPos.y < ground) _camPos.y = ground;
    this.engine.camera.position.copy(_camPos);
    this.engine.camera.up.copy(WORLD_UP);
    _look.copy(target).addScaledVector(WORLD_UP, 0.8);
    this.engine.camera.lookAt(_look);
    this.engine.camera.fov = 58;
    this.engine.camera.updateProjectionMatrix();

    this.showcaseLight.position.copy(this.engine.camera.position)
      .addScaledVector(WORLD_UP, 3);
  }

  /**
   * Opt-in on-screen readout (`?gearDebug=1`) showing the gear value that is
   * actually driving the model next to the nose-door hinge angle it produces.
   * Purely diagnostic: without the query param nothing is created or updated.
   */
  _updateGearDebug() {
    const jet = this.playerJet;
    if (!jet) return;
    if (!this.gearDebugEl) {
      const el = document.createElement('div');
      el.id = 'gear-debug';
      el.style.cssText = 'position:fixed;left:16px;bottom:56px;z-index:40;' +
        'font:12px/1.5 Consolas,monospace;color:#9fe8c8;' +
        'background:rgba(6,14,12,.72);padding:6px 9px;pointer-events:none;';
      document.body.appendChild(el);
      this.gearDebugEl = el;
    }
    const systems = this.player?.systems;
    const doors = (jet.cadGearDoors || []).filter((d) => d.kind === 'front');
    // The two nose doors rotate in opposite directions, so compare magnitudes
    // rather than averaging the signed angles.
    const angle = doors.reduce(
      (max, d) => Math.max(max, Math.abs(d.angle ?? 0) * 180 / Math.PI), 0);
    const gear = systems?.gear ?? NaN;
    // Door angles are relative to the exported OPEN pose, so a large
    // rotation means closed. Report the gear state instead of reversing it.
    const state = gear < 0.02 ? 'closed' : gear > 0.98 ? 'OPEN' : 'moving';
    this.gearDebugEl.textContent =
      `gear ${gear.toFixed(3)} (target ${systems?.gearTarget ?? '?'})  ` +
      `nose doors ${angle.toFixed(1)}deg  ${state}`;
  }

  _loop(now) {
    requestAnimationFrame(this._loop);
    const elapsed = (now - this.lastFrame) / 1000;
    const dt = Math.min(0.1, Math.max(0, elapsed));
    this.lastFrame = now;
    if (dt > 0) this.fps = damp(this.fps, 1 / dt, 3, dt);
    if (this.state === 'menu') {
      this.time += dt;
      this._updateShowcase(dt);
      this.effects.update(dt, this.engine.camera);
      this.world.update(dt, this.engine.camera, this._showcasePose?.position);
    } else if (this.state === 'playing' || this.state === 'dying') {
      if (this.state === 'playing') {
        this.time += dt;
        this.destroyNoticeTimer = Math.max(0, this.destroyNoticeTimer - dt);
        this._frameInput(dt);
        if (this.state !== 'playing') {
          this.engine.render();
          this.input.endFrame();
          return;
        }
        this.accumulator += dt;
        let steps = 0;
        while (this.accumulator >= FIXED_STEP && steps < MAX_STEPS) {
          this._fixedUpdate(FIXED_STEP);
          this.accumulator -= FIXED_STEP;
          steps++;
        }
        this.accumulator = Math.min(this.accumulator, FIXED_STEP * 2);
        this.visualAlpha = clamp(this.accumulator / FIXED_STEP, 0, 1);
        this._syncVisuals(dt, this.visualAlpha);
        this._updateLock(dt);
        this._updateRadar(dt);
        this._updateRwr(dt);
        this._updateWarnings();
        if (this.gearDebug) this._updateGearDebug();
        this._updateCamera(dt);
        this.effects.update(dt, this.engine.camera);
        this.world.update(dt, this.engine.camera,
          this.playerView?.position || this.player?.flight.position);
        this._updateHud(dt);
        this._updateAudio(dt);
        this._updateMission(dt);
        this.hitMarker = Math.max(0, this.hitMarker - dt);
        this._updateGStress(dt);
      } else {
        this.time += dt;
        this.deathTimer += dt;
        this._updateDeathCamera(dt);
        this.effects.update(dt, this.engine.camera);
        this.world.update(dt, this.engine.camera, this.deathPosition);
        if (this.deathTimer > 1.35 && this.state === 'dying') {
          this.state = 'dead';
          this.screens.showDeath(this.deathInfo);
        }
      }
    } else if (this.state === 'dead') {
      this.time += dt;
      this._updateDeathCamera(dt);
      this.effects.update(dt, this.engine.camera);
      this.world.update(dt, this.engine.camera, this.deathPosition);
    } else if (this.state === 'paused') {
      // Deliberately frozen; the modal is composited over the last frame.
    }
    this.engine.render();
    this.input.endFrame();
  }

  _frameInput(dt) {
    const input = this.input;
    const player = this.player;
    if (!player || !player.alive) return;
    const pressed = input.getPressedActions();
    this.mouseLook = this.input.consumeMouseDelta();
    const weaponSelect = pressed.has('weaponNext');
    if (weaponSelect) {
      const slot = player.cycleMissile();
      if (slot) {
        this.screens.toast(`${slot.name} · ${slot.remaining} 枚`,
          { duration: 1400, tone: 'info' });
      }
    }
    if (pressed.has('radarRange')) {
      const idx = (RADAR_RANGES.indexOf(this.radar.range) + 1) %
        RADAR_RANGES.length;
      this.radar.range = RADAR_RANGES[idx];
      this.screens.toast(`雷达量程 ${Math.round(this.radar.range / 1000)} km`,
        { duration: 1400, tone: 'info' });
    }
    if (pressed.has('mouseCapture')) this._toggleAltMouse();
    // Default view is mouse-look, shooter-style. The aircraft autopilot follows
    // this view; the camera is not slaved to the aircraft's heading.
    if (!this.altMouse) {
      const lookSens = this.settings.sensitivity ?? 1;
      this.viewYaw += this.mouseLook.dx * 0.0022 * lookSens;
      const lookY = this.input.invertY ? -this.mouseLook.dy : this.mouseLook.dy;
      this.viewPitch = clamp(
        this.viewPitch - lookY * 0.0018 * lookSens,
        -75 * DEG, 75 * DEG);
    }

    if (pressed.has('canopy')) {
      player.toggleCanopy();
      const open = player.systems.canopyTarget > 0.5;
      this.screens.toast(open ? '座舱盖打开' : '座舱盖关闭', { duration: 1200 });
      this._pushStatus(open ? 'CANOPY OPEN' : 'CANOPY CLOSED', 'info', 1.4);
    }
    if(player.config.systems.dragChute&&pressed.has('dragChute')&&player.onGround){player.systems.parachute=player.systems.parachute?0:1;this.screens.toast(player.systems.parachute?'减速伞展开':'减速伞收回');}
    if(player.config.systems.fuelDumpRate&&pressed.has('fuelDump')){player.systems.fuelDump=!player.systems.fuelDump;this.screens.toast(player.systems.fuelDump?'开始放油':'停止放油');}
    if(player.config.armament.cannon.belts&&pressed.has('cannonBelt')){const cannon=player.config.armament.cannon,names=Object.keys(cannon.belts);cannon.belt=names[(names.indexOf(cannon.belt||'default')+1)%names.length];this.screens.toast((cannon.caliber||30)+'毫米弹链：'+({default:'默认',universal:'通用',ground:'穿甲',armored:'穿甲',air:'对空',stealth:'隐踪'}[cannon.belt]));}
    if(pressed.has('jettisonTanks')){const dropped=this.combat.jettisonTanks(player);this.screens.toast(dropped.length?'已抛弃 '+dropped.length+' 个副油箱':'没有可抛弃的副油箱',{duration:1800});}
    if (pressed.has('camera')) {
      this.cameraMode = this.cameraMode === 'chase' ? 'cockpit' : 'chase';
      this.cameraRig.setMode(this.cameraMode);
      this.playerJet.setCockpitView(this.cameraMode === 'cockpit');
      this.screens.toast(this.cameraMode === 'cockpit' ? '座舱视角' : '追尾视角',
        { duration: 1200 });
    }
    if (pressed.has('gear')) {
      if (player.onGround && player.systems.gearTarget > 0.5) {
        this._pushStatus('起落架不可收起 · 地面状态', 'danger', 2.2);
      } else {
        player.toggleGear();
        this.audio.gearMove();
        this._pushStatus(player.systems.gearTarget > 0.5 ? '起落架放下' : '起落架收起',
          'info', 2.2);
      }
    }
    if (pressed.has('flaps') || pressed.has('takeoffFlaps')) {
      if (pressed.has('flaps')) player.toggleFlaps();
      if (pressed.has('takeoffFlaps')) player.setTakeoffFlaps();
      const target = player.systems.flapTarget;
      const label = target > 0.8 ? '着陆襟翼放下'
        : target > 0.25 ? '起飞襟翼放下' : '襟翼收起';
      this._pushStatus(label, 'info', 2.2);
    }
    if (pressed.has('airbrake')) {
      player.toggleAirbrake();
      this.audio.airbrakeMove();
      this._pushStatus(player.systems.airbrakeTarget > 0.5 ? '减速板展开' : '减速板收起',
        'info', 2.2);
    }
    if (pressed.has('telemetry')) {
      this.telemetryVisible = !this.telemetryVisible;
      this.screens.toast(this.telemetryVisible ? '遥测数据开启' : '遥测数据关闭',
        { duration: 1200 });
    }
    if (pressed.has('map')) {
      this.mapOpen = !this.mapOpen;
      this._pushStatus(this.mapOpen ? '战术地图开启 · ' + input.bindingLabel('map') + ' 关闭' : '战术地图关闭',
        'info', 2.2);
    }
    if (pressed.has('mute')) {
      this.settings.muted = !this.settings.muted;
      this.audio.setMuted(this.settings.muted);
      this.screens.setMuted(this.settings.muted);
      this.screens.toast(this.settings.muted ? '音频静音' : '音频恢复',
        { duration: 1200 });
    }
    if (pressed.has('targetNext')) this._cycleLock();
    if (pressed.has('weaponFire')) this._handleMissileKey();
    if (pressed.has('pitchLadder')) {
      const visible = this.screens.togglePitchLadder();
      this.screens.toast(visible ? '姿态指示线开启' : '姿态指示线关闭',
        { duration: 1100 });
    }
    if (pressed.has('flares')) {
      if (!this.combat.deployFlares(player)) {
        this.screens.toast('干扰弹耗尽', { duration: 1000, tone: 'danger' });
      }
    }
    if (pressed.has('chaff')) {
      if (!this.combat.deployChaff(player)) {
        this.screens.toast('箔条耗尽', { duration: 1000, tone: 'danger' });
      }
    }

    // C toggles free look (on by default). The mouse may orbit the view but
    // must not steer the nose while the pilot is checking six o'clock.
    const wasFreeLook = this.freeLook;
    if (pressed.has('freeLook')) this.freeLook = !this.freeLook;
    const wantsFreeLook = this.freeLook;
    if (wasFreeLook && !wantsFreeLook) {
      // On C release, bring the look/aim point back to the nose so the next
      // mouse movement starts from the boresight instead of the six-o'clock view.
      this.viewReturnTimer = 0.18;
    }
    if (this.viewReturnTimer > 0 && !wantsFreeLook) {
      this._returnViewToNose(dt, player);
    }
    this._updateMouseAim(dt, player);

    let throttle = this.throttleTarget;
    if (input.isActionDown('throttleUp')) {
      throttle += dt * 0.46;
    }
    if (input.isActionDown('throttleDown')) {
      throttle -= dt * 0.62;
    }
    if (input.wheel) throttle -= input.wheel * 0.028;
    this.throttleTarget = clamp(throttle, 0, 1.1);
    this.hintTimer = Math.max(0, this.hintTimer - dt);
    if (pressed.has('pause') || pressed.has('help')) {
      this.pause();
      if (pressed.has('help')) this.screens.showHelp();
    }
  }

  _onUiKeys(e) {
    if (this.screens.bindingCapture || e.repeat || this.state === 'playing' ||
        e.target?.closest?.('input,select,textarea')) return;
    if (this.state !== 'menu' && this.state !== 'paused') return;
    const actions = activeControlActions(this.input.bindings, eventKeyCodes(e, this.input.keys));
    if (actions.has('help')) this.screens.showHelp();
    else if (actions.has('pause')) {
      if (!this.screens.closeModal() && this.state === 'paused') this.resume();
    } else return;
    this.input.clear();
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  _returnViewToNose(dt, player) {
    const targetYaw = player.flight.heading * DEG;
    const targetPitch = player.flight.pitch * DEG;
    const dyaw = Math.atan2(
      Math.sin(targetYaw - this.viewYaw),
      Math.cos(targetYaw - this.viewYaw));
    const dpitch = targetPitch - this.viewPitch;
    const k = 1 - Math.exp(-24 * dt);
    this.viewYaw += dyaw * k;
    this.viewPitch += dpitch * k;
    this.viewReturnTimer = Math.max(0, this.viewReturnTimer - dt);
    if (Math.abs(dyaw) < 0.0015 && Math.abs(dpitch) < 0.0015) {
      this.viewYaw = targetYaw;
      this.viewPitch = targetPitch;
      this.viewReturnTimer = 0;
    }
  }

  _resetFreeLook() {
    // Free look (C) is on by default: every start, respawn and resume returns
    // to it. The camera rig still restarts from the boresight.
    this.freeLook = FREE_LOOK_DEFAULT;
    this.viewReturnTimer = 0;
    if (this.cameraRig) this.cameraRig.endFreeLook();
    this.mouseAim.reset();
    this.aimInputs = { pitch: 0, roll: 0, yaw: 0 };
  }

  _toggleAltMouse() {
    this.altMouse = !this.altMouse;
    if (this.altMouse) {
      this.input.releaseMouseForUi();
      document.body.classList.add('show-cursor');
      this.screens.toast('鼠标已释放 · 再按 ' + this.input.bindingLabel('mouseCapture') + ' 锁定', { duration: 1500 });
    } else {
      this.input.captureMouseForFlight();
      document.body.classList.remove('show-cursor');
      this.screens.toast('鼠标已锁定', { duration: 1000 });
    }
  }

  _resetAltMouse() {
    this.altMouse = false;
    this.input.altMouse = false;
    document.body.classList.remove('show-cursor');
  }

  _pushStatus(text, tone = 'info', duration = 2.6) {
    this.statusFeed.push({ text, tone, time: this.time, duration });
    if (this.statusFeed.length > 6) this.statusFeed.shift();
  }

  _updateMouseAim(dt, player) {
    if (!player || !player.alive) return;
    if (player.onGround) {
      // Ground handling stays direct: S rotates, A/D steers, mouse is not a
      // nose-following aim device while the wheels are down.
      const pitch = (this.input.isActionDown('pitchUp') ? 1 : 0) -
        (this.input.isActionDown('pitchDown') ? 1 : 0);
      const roll = (this.input.isActionDown('rollRight') ? 1 : 0) -
        (this.input.isActionDown('rollLeft') ? 1 : 0);
      const yaw = (this.input.isActionDown('yawRight') ? 1 : 0) -
        (this.input.isActionDown('yawLeft') ? 1 : 0);
      this.aimInputs = { pitch, roll, yaw: yaw * 0.7 };
      return;
    }
    if (this.freeLook) {
      // Free look only detaches the mouse from the nose. The keyboard remains a
      // normal flight control: W/S pitch, A/D roll (including 360° rolls),
      // Q/Y rudder. E is reserved for chaff. This is essential for checking
      // six while still flying.
      this.aimInputs = {
        pitch: (this.input.isActionDown('pitchUp') ? 1 : 0) -
          (this.input.isActionDown('pitchDown') ? 1 : 0),
        roll: (this.input.isActionDown('rollRight') ? 1 : 0) -
          (this.input.isActionDown('rollLeft') ? 1 : 0),
        yaw: ((this.input.isActionDown('yawRight') ? 1 : 0) -
          (this.input.isActionDown('yawLeft') ? 1 : 0)) * 0.7,
      };
      return;
    }
    const view = this.playerView || player.flight;
    const keyboard = {
      pitch: (this.input.isActionDown('pitchUp') ? 1 : 0) -
        (this.input.isActionDown('pitchDown') ? 1 : 0),
      roll: (this.input.isActionDown('rollRight') ? 1 : 0) -
        (this.input.isActionDown('rollLeft') ? 1 : 0),
    };
    this.aimInputs = this.mouseAim.updateToward(
      view, this.viewYaw, this.viewPitch, { keyboard, dt });
  }

  _buildPlayerInputs() {
    return {
      pitch: this.aimInputs.pitch,
      roll: this.aimInputs.roll,
      yaw: this.aimInputs.yaw,
      throttle: this.throttleTarget,
    };
  }

  _fixedUpdate(dt) {
    const player = this.player;
    const playing = this.state === 'playing';
    if (!playing || !player) return;
    this.missionTime += dt;

    if (player.alive) {
      const inputs = this._buildPlayerInputs();
      player.update(dt, inputs, this.world);
      player.throttleTarget = this.throttleTarget;
      const trigger = this.input.isActionDown('gunFire') && !this.altMouse;
      this.combat.fireGun(player, dt, trigger);
    }

    for (const record of this.enemyRecords) {
      const ai = record.ai;
      const ac = record.aircraft;
      if (!ac.alive) continue;
      const inputs = ai.update(dt,
        this.player && this.player.alive ? this.player : null,
        this.world, this.combat.getIncomingMissiles(ac));
      ac.update(dt, inputs, this.world);
      if (ai.wantsGun) this.combat.fireGun(ac, dt, true);
      if (ai.requestMissile && this.player?.alive) {
        // One bandit, one missile: never let a single MiG saturate the RWR
        // with multiple simultaneous launches.
        const hasMissileInFlight = this.combat.missiles.some(
          (m) => m.alive && m.owner === ac);
        if (!hasMissileInFlight) this.combat.launchMissile(ac, this.player);
      }
      if (ai.requestFlare) this.combat.deployFlares(ac);
    }

    this.combat.update(dt);

    if (player) {
      this._processEvents(player, player.takeEvents(), true);
    }
    for (const record of [...this.enemyRecords]) {
      this._processEvents(record.aircraft, record.aircraft.takeEvents(), false);
    }
    this.enemyRecords = this.enemyRecords.filter((r) => r.aircraft.alive || r.keep);
    for (const record of this.enemyRecords) {
      if (!record.aircraft.alive) {
        record.keep = Math.max(0, (record.keep || 0) - dt);
      }
    }
    this._refreshEnemyList();
    this._fillGunTarget();
  }

  _processEvents(aircraft, events, isPlayer) {
    if (!events.length) return;
    const record = this._recordFor(aircraft);
    for (const event of events) {
      switch (event.type) {
        case 'damaged':
          if (event.attacker === this.player) {
            this.hitMarker = 0.22;
          }
          break;
        case 'landed':
          if (isPlayer) {
            this._pushStatus('接地成功 · 保持中线，减速', 'good', 3.2);
            this.screens.toast('接地成功 · 保持中线，减速', {
              duration: 2500, tone: 'good',
            });

          }
          break;
        case 'takeoff':
          if (isPlayer) {
            this.hasTakenOff = true;
            this._pushStatus('已升空 · 自动收起落架；襟翼手动收起', 'good', 3.2);
            this.screens.toast('已升空 · 自动收起落架；襟翼手动收起', {
              duration: 2400, tone: 'good',
            });

          }
          break;
        case 'overstress':
          if (isPlayer) {
            this._pushStatus('机体过载 · 注意 G 限制', 'danger', 2.5);
            this.screens.toast('机体过载 · 注意 G 限制', {
              duration: 1600, tone: 'danger',
            });
          }
          break;
        case 'destroyed':
        case 'crashed':
          this._handleKillOrCrash(record, aircraft, event, isPlayer);
          break;
        default:
          break;
      }
    }
  }

  _handleKillOrCrash(record, victim, event, isPlayer) {
    if (!record) return;
    const pos = event.position || victim.flight.position.clone();
    const water = event.water || pos.y < 1.5;
    if (water) {
      this.effects.waterSplash(pos, 2.2);
    } else {
      this.effects.explosion(pos, isPlayer ? 1.4 : 1.15,
        event.velocity || victim.flight.velocity);
    }
    const player = this.player;
    const dist = player ? pos.distanceTo(player.flight.position) : 9999;
    this.audio.explosion(dist, isPlayer ? 1 : 0.8);
    if (dist < 250) this.cameraRig.kick(0.9);

    if (isPlayer) {
      // Keep the player's GPU resources until respawn/teardown. Disposing
      // geometries and textures in the death frame is a synchronous GPU stall.
      if (record.jet) record.jet.group.visible = false;
      for (const trail of record.trails) this.effects.removeTrail(trail);
    } else if (record.poolEntry) {
      this._releaseEnemyResources(record);
      record.jet = null;
    } else if (record.jet) {
      this.engine.scene.remove(record.jet.group);
      record.jet.dispose();
      record.jet = null;
      for (const trail of record.trails) this.effects.removeTrail(trail);
    }
    record.trails = [];
    this.enemies = this.enemies.filter((e) => e !== victim);

    this.killfeed.push(killFeedEntry(victim, event, player, this.time));
    if (this.killfeed.length > 8) this.killfeed.shift();
    if (isPlayer) {
      this._beginDeath(event, pos);
      return;
    }

    const attacker = event.attacker;
    const weapon = event.source || 'cannon';
    if (attacker === player && player) {
      this.kills++;
      this.killStreak = this.time - this.lastKillTime <= 10
        ? this.killStreak + 1 : 1;
      this.lastKillTime = this.time;
      this.destroyNoticeTimer = 5;
      this.score += weapon === 'missile' ? 150 : 100;
      this.audio.callout('enemy_destroyed', '目标击毁。', { cooldown: 3 });
    }
    const idx = this.enemyRecords.indexOf(record);
    if (idx >= 0) this.enemyRecords.splice(idx, 1);
  }

  _beginDeath(event, pos) {
    if (this.state !== 'playing') return;
    this.state = 'dying';
    this.audio.stopVoice();
    this.audio.update(0, { spool: 0, afterburner: 0, tas: 0, gunFiring: false });
    this.mapOpen = false;
    this._resetAltMouse();
    this.input.exitPointerLock();
    this._resetFreeLook();
    this.deathTimer = 0;
    this.deathPosition.copy(pos);
    const reason = event.type === 'crashed'
      ? (event.water ? '战机坠入海面，飞行记录终结。' : '战机撞地，结构完全损毁。')
      : event.attacker
        ? `你被 ${event.attacker.callsign || '敌方战机'} 击落，武器：${killWeaponName(event)}。`
        : '战机结构失效，任务终止。';
    this.deathInfo = {
      reason,
      score: this.score,
      kills: this.kills,
      time: formatTime(this.missionTime),
    };
    if (this.playerJet) this.playerJet.group.visible = false;
    if (this.playerRecord) {
      for (const trail of this.playerRecord.trails) this.effects.removeTrail(trail);
      this.playerRecord.trails = [];
    }
    this.input.setEnabled(false);
    this.screens.toast('战机损毁', { duration: 1200, tone: 'danger' });
  }

  _updateDeathCamera(dt) {
    const a = this.deathTimer * 0.22;
    const radius = 70 + this.deathTimer * 10;
    const cam = this.engine.camera;
    _camPos.set(
      this.deathPosition.x + Math.cos(a) * radius,
      this.deathPosition.y + 26 + Math.sin(a * 0.7) * 8,
      this.deathPosition.z + Math.sin(a) * radius);
    const ground = this.world.groundHeight(_camPos.x, _camPos.z) + 4;
    if (_camPos.y < ground) _camPos.y = ground;
    cam.position.lerp(_camPos, 1 - Math.exp(-2.5 * dt));
    cam.up.set(0, 1, 0);
    cam.lookAt(this.deathPosition);
    if (Math.abs(cam.fov - 50) > 0.1) {
      cam.fov = damp(cam.fov, 50, 2, dt);
      cam.updateProjectionMatrix();
    }
  }

  _ensurePlayerView() {
    const flight = this.player?.flight;
    if (!flight) return null;
    if (!this.playerView || this.playerViewSource !== flight) {
      this.playerView = Object.create(flight);
      this.playerViewSource = flight;
      this.playerView.position = new THREE.Vector3();
      this.playerView.orientation = new THREE.Quaternion();
      this.playerView.velocity = new THREE.Vector3();
      this.playerView.basis = {};
      basisFromQuaternion(flight.orientation, this.playerView.basis);
    }
    return this.playerView;
  }

  _updatePlayerView(alpha) {
    const view = this._ensurePlayerView();
    if (!view) return null;
    this.player.flight.getRenderPose(alpha, view.position,
      view.orientation, view.velocity);
    basisFromQuaternion(view.orientation, view.basis);
    const f = view.basis.forward;
    const right = view.basis.right;
    const up = view.basis.up;
    view.heading = (Math.atan2(f.x, -f.z) * RAD + 360) % 360;
    view.pitch = Math.asin(clamp(f.y, -1, 1)) * RAD;
    view.bank = Math.atan2(-right.y, up.y) * RAD;
    view.verticalSpeed = view.velocity.y;
    return view;
  }

  _syncVisuals(dt, alpha = 1) {
    const player = this.player;
    const view = this._updatePlayerView(alpha);
    if (this.playerRecord && this.playerRecord.jet && player && view) {
      const rec = this.playerRecord;
      rec.jet.sync(dt, view, player.systems, player.weapons, {
        cockpit: this.cameraMode === 'cockpit' && player.alive,
        position: view.position,
        orientation: view.orientation,
        onGround: player.onGround,
        gunFiring: !!player.gunFire && player.alive &&
          !player.onGround && player.weapons.ammo > 0,
      });
      this._updateVapor(rec);
      this._updateDamageSmoke(rec, dt);
    }
    for (const record of this.enemyRecords) {
      if (!record.aircraft.alive || !record.jet) continue;
      record.aircraft.flight.getRenderPose(alpha,
        _posePos, _poseQuat, _poseVel);
      record.jet.sync(dt, record.aircraft.flight,
        record.aircraft.systems, record.aircraft.weapons, {
          cockpit: false,
          position: _posePos,
          orientation: _poseQuat,
          onGround: record.aircraft.onGround,
          gunFiring: !!record.aircraft.gunFire,
        });
      this._updateVapor(record);
      this._updateDamageSmoke(record, dt);
    }
  }

  _updateVapor(record) {
    const { aircraft, jet } = record;
    if (!jet || record.trails.length === 0) return;
    const alive = aircraft.alive && !aircraft.onGround;
    const g = aircraft.flight.normalLoad;
    const speed = aircraft.flight.tas;
    const vapor = clamp((g - 3.0) / 4.8, 0, 1) *
      smoothstep(140, 250, speed);
    const level = clamp(vapor, 0, 1);
    const emit = alive && level > 0.02;
    for (let i = 0; i < 2; i++) {
      if (record.trails[i]) {
        record.trails[i].setOpacity(emit ? 0.06 + level * 0.4 : 0);
        if (emit) {
          const local = jet.parts.wingTips[i].clone();
          jet.group.localToWorld(local);
          record.trails[i].push(local);
        }
      }
    }
  }

  _updateDamageSmoke(record, dt) {
    const { aircraft, jet } = record;
    if (!aircraft.alive) return;
    const severity = aircraft.damageSeverity;
    record.smokeTimer -= dt;
    if (severity > 0.14 && record.smokeTimer <= 0) {
      record.smokeTimer = 0.11 - severity * 0.055;
      const pos = aircraft.flight.position.clone();
      if (jet) {
        const local = jet.parts.nozzleLocal[0].clone();
        jet.group.localToWorld(local);
        pos.copy(local);
      }
      this.effects.damageSmoke(pos, aircraft.flight.velocity, severity);
    }
  }

  _updateCamera(dt) {
    if (!this.player || !this.playerJet) return;
    let kick = 0;
    if (this.input.isActionDown('gunFire') && this.player.alive) kick += 0.018;
    const view = this.playerView || this.player.flight;
    this.cameraRig.update(dt, view, this.playerJet,
      kick + this.cameraRig.shake * 0.2, {
        view: { yaw: this.viewYaw, pitch: this.viewPitch },
        freeLook: {
          active: this.freeLook,
          x: this.input.mouse.x,
          y: this.input.mouse.y,
          dx: this.mouseLook.dx,
          dy: this.mouseLook.dy,
          relative: true,
          inside: this.input.mouse.inside,
        },
        width: this.engine.width,
        height: this.engine.height,
      });
  }

  _updateHud() {
    if (!this.player) return;
    const p = this.player;
    const lock = this.lockCandidate && this.lockProgress > 0.001
      ? { target: this.lockCandidate, progress: Math.min(1, this.lockProgress) }
      : null;
    let cockpitHudAnchor = null;
    if (this.cameraMode === 'cockpit' && this.playerJet) {
      this.playerJet.getCockpitEye(this._cockpitHudAnchor);
      this._cockpitHudAnchor.addScaledVector(p.flight.basis.forward, 0.55);
      cockpitHudAnchor = this._cockpitHudAnchor;
    }
    const state = {
      flight: this.playerView || p.flight,
      aircraft: p,
      camera: this.engine.camera,
      input: this.input,
      targets: this.enemies,
      lockedTarget: this.lockProgress >= 1 ? this.lockCandidate : null,
      gunTarget: this.gunTarget,
      lock,
      score: this.score,
      wave: this.wave,
      mode: this.mode,
      pitchLadder: !!this.settings.pitchLadder,
      freeLook: this.freeLook,
      cameraMode: this.cameraMode,
      cockpitHudAnchor,
      mapOpen: this.mapOpen,
      statusFeed: this.statusFeed,
      peakG: this.peakG,
      destroyNotice: this.destroyNoticeTimer > 0,
      destroyNoticeCount: this.destroyNoticeTimer > 0 ? this.killStreak : 0,
      radar: this.radar,
      rwr: this.rwr,
      map: this.world?.mapCanvas,
      mapSize: this.world?.mapSize,
      airbase: this.world?.airbase,
      boundary: this.world?.boundaryRadius,
      enemiesRemaining: this.enemies.filter((e) => e.alive).length,
      killfeed: this.killfeed,
      warnings: this.warnings,
      time: this.time,
      hintAlpha: this.hintTimer > 0 ? clamp(this.hintTimer / 2.5, 0, 1) : 0,
      keyBindings: this.input.bindings,
      gEffect: this.gStress,
      redout: this.redout,
      telemetryVisible: this.telemetryVisible,
      damage: p.damageSeverity,
      fps: this.fps,
      hitMarker: this.hitMarker,
      incoming: this.incoming.length,
      incomingMissiles: this.incoming,
    };
    this.hud.render(state);
  }

  _updateLock(dt) {
    const player = this.player;
    const wasLocked = this.lockProgress >= 1;
    if (!player || !player.alive) {
      this.lockCandidate = null;
      this.lockProgress = 0;
      if (player) player.datalinkTarget = null;
      return;
    }
    player.datalinkTarget = null;
    const target = this.lockCandidate;
    if (target && !target.alive) {
      this.lockCandidate = null;
      this.lockProgress = 0;
    }
    if (!this.lockCandidate) return;
    const missile = this.player.getMissileConfig();
    _tmp.copy(this.lockCandidate.flight.position).sub(player.flight.position);
    const dist = _tmp.length();
    const azimuth = Math.atan2(
      _tmp.dot(player.flight.basis.right),
      _tmp.dot(player.flight.basis.forward));
    const elevation = Math.atan2(_tmp.y,
      Math.max(1, Math.hypot(
        _tmp.dot(player.flight.basis.right),
        _tmp.dot(player.flight.basis.forward))));
    const lockRange=this._weaponLockRange(missile,this.lockCandidate);
    const seekerLimited=!!player.config.systems.seekerLimitedLock;
    const valid = dist < Math.min(lockRange * 1.2,
      RADAR_WORK_RANGE * 1.1) &&
      Math.abs(azimuth) < (seekerLimited?Math.min(this.radar.azimuth,missile.lockAngle||Infinity):this.radar.azimuth) &&
      Math.abs(elevation) < (seekerLimited?Math.min(this.radar.elevation,missile.lockAngle||Infinity):this.radar.elevation);
    if (valid) {
      this.lockProgress = Math.min(1, this.lockProgress + dt / 1.15);
      player.datalinkTarget = this.lockCandidate;
      if (this.lockProgress >= 1 && !wasLocked) {
        this.audio.callout('vws_lock', '锁定。', { priority: true });
      }
    } else {
      this.lockProgress = Math.max(0, this.lockProgress - dt * 1.8);
      if (this.lockProgress <= 0) this.lockCandidate = null;
    }
  }

  _updateWarnings() {
    const p = this.player;
    if (!p || !p.alive) { this.warnings = []; return; }
    const f = p.flight;
    const w = [];
    this.incoming = this.combat.getIncomingMissiles(p);
    if (this.incoming.length) {
      w.push({ text: '敌导弹 / MISSILE INBOUND', level: 'danger', blink: true });
    }
    const agl = f.position.y - this.world.groundHeight(f.position.x, f.position.z);
    if (!p.onGround && agl < 300 && f.verticalSpeed < -18) {
      w.push({ text: 'PULL UP', level: 'danger', blink: true });
    }
    if (!p.onGround && agl < 260 && p.systems.gear < 0.12 &&
      f.verticalSpeed < -3) {
      w.push({ text: 'GEAR UP', level: 'danger' });
    }
    if (p.aoaDeg > p.config.limits.alphaLimit * RAD - 4.5 &&
      f.tas < 160) {
      w.push({ text: 'STALL', level: 'danger', blink: true });
    }
    if (f.iasKmh > p.config.limits.maxIas) {
      w.push({ text: 'OVERSPEED', level: 'danger', blink: true });
    }
    if (p.systems.gear > 0.1 && f.iasKmh > p.config.limits.gearIas) {
      w.push({ text: 'GEAR OVERSPEED', level: 'danger' });
    }
    const flapLimit=p.systems.flaps<=.65?(p.config.limits.flapTakeoffIas??p.config.limits.flapIas):p.config.limits.flapIas;
    if (p.systems.flaps > 0.1 && f.iasKmh > flapLimit) {
      w.push({ text: 'FLAP OVERSPEED', level: 'caution' });
    } else if (!p.onGround && p.systems.flaps > 0.5 && f.iasKmh >= 500) {
      w.push({ text: 'FLAP CLEANUP · F', level: 'caution' });
    }
    if (f.fuel < 280) {
      w.push({ text: 'BINGO FUEL', level: 'caution', blink: true });
    }
    if (p.health < 55) {
      w.push({ text: 'AIRFRAME DAMAGE', level: 'caution' });
    }
    if (Math.hypot(f.position.x, f.position.z) > this.world.bounds) {
      w.push({ text: 'RETURN TO COMBAT AREA', level: 'danger', blink: true });
    }
    this.warnings = w;
    this.cockpitWarnings.update({ player: p, warnings: w, agl,
      rwr: this.rwr, time: this.time });
    const anyDanger = w.some((x) => x.level === 'danger');
    this.warningAudio = {
      active: w.length > 0,
      level: anyDanger ? 'danger' : 'caution',
    };
  }

  _updateAudio(dt) {
    if (!this.player) return;
    const f = this.player.flight;
    const lockOn = !!this.lockCandidate;
    this.audio.update(dt, {
      spool: f.engineSpool,
      afterburner: f.afterburner,
      tas: f.tas,
      altitude: f.position.y,
      gunFiring: !!this.player.gunFire,
      gunRate: this.player.config.armament.cannon.rate / 60,
      lockTone: lockOn,
      lockProgress: this.lockProgress,
      lockSeeker: this.player.getMissileConfig().radar ? 'radar' : 'ir',
      warning: this.warningAudio?.active,
      warningLevel: this.warningAudio?.level,
      rwrLocked: this.rwr.locked,
      rwrSearch: this.rwr.search,
      rwrMissile: this.rwr.missile,
      rwrNewAt: this.rwr.newAt,
      buffet: f.buffet,
      cockpit: this.cameraMode === 'cockpit',
    });
  }

  _updateMission(dt) {
    if (this.mode === 'test') return;
    if (this.player && !this.player.onGround) this.hasTakenOff = true;
    if (!this.hasTakenOff) return;
    if (this.waveState === 'waiting') {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) {
        this._spawnWave();
      }
    } else if (this.waveState === 'intermission') {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) {
        this.wave++;
        this._spawnWave();
      }
    } else if (this.waveState === 'active') {
      const alive = this.enemies.filter((e) => e.alive).length;
      if (alive === 0 && this.state === 'playing') {
        if (this.mode === 'runway') {
          this.waveState = 'inactive';
          this.waveTimer = 0;
          this.screens.toast('空域肃清', { duration: 3200, tone: 'good' });
          return;
        }
        this.waveState = 'intermission';
        this.waveTimer = 6;
        this.screens.toast('空域肃清 · 下一批敌机即将抵达',
          { duration: 3200, tone: 'good' });
      }
    }
  }

  _spawnWave() {
    if (this.mode === 'test') { this.waveState = 'inactive'; return; }
    const player = this.player;
    if (!player) return;
    const count = 5;
    const spawns = enemyWaveSpawns({
      mode: this.mode, world: this.world,
      playerPosition: player.flight.position, count,
    });
    for (let i = 0; i < count; i++) {
      const call = `FULCRUM ${this.wave}-${i + 1}`;
      const ac = new Aircraft(MIG29, {
        isPlayer: false, team: 'red', callsign: call,
      });
      ac.trackId = this.nextTrackId++;
      ac.reset(spawns[i]);
      const resources = this._acquireEnemyResources();
      const jet = resources.jet;
      const trails = resources.trails;
      const ai = new AIPilot(ac, {
        passive: false,
        skill: 0.52,
        name: call,
      });
      const record = {
        aircraft: ac, jet, trails, ai, poolEntry: resources,
        smokeTimer: 0, keep: 0,
      };
      this.enemyRecords.push(record);
      this.enemies.push(ac);
      ai.target = this.player;
    }
    this.waveState = 'active';
    this.waveTimer = 10;
    this.screens.toast(`RADAR CONTACT · ${count} 架敌机`,
      { duration: 2200, tone: 'danger' });
  }

  _updateRadar(dt) {
    const p = this.player;
    if (!p || !p.alive) {
      this.radar.contacts = [];
      return;
    }
    const radar = this.radar;
    radar.scanAngle += radar.scanDir * dt * 2.3;
    if (radar.scanAngle > radar.azimuth) {
      radar.scanAngle = radar.azimuth;
      radar.scanDir = -1;
    } else if (radar.scanAngle < -radar.azimuth) {
      radar.scanAngle = -radar.azimuth;
      radar.scanDir = 1;
    }
    const right = p.flight.basis.right;
    const forward = p.flight.basis.forward;
    const contacts = radar.contacts;
    contacts.length = 0;
    const pool = radar.contactPool;
    let index = 0;
    for (const target of this.enemies) {
      if (!target.alive) continue;
      _tmp.copy(target.flight.position).sub(p.flight.position);
      const range = _tmp.length();
      if (range > RADAR_WORK_RANGE || range < 30) continue;
      const azimuth = Math.atan2(_tmp.dot(right), _tmp.dot(forward));
      if (Math.abs(azimuth) > radar.azimuth) continue;
      const elevation = Math.atan2(_tmp.y,
        Math.max(1, Math.hypot(_tmp.dot(right), _tmp.dot(forward))));
      if (Math.abs(elevation) > radar.elevation) continue;
      const losX = _tmp.x / Math.max(1, range);
      const losY = _tmp.y / Math.max(1, range);
      const losZ = _tmp.z / Math.max(1, range);
      const closure = -(target.flight.velocity.x - p.flight.velocity.x) * losX -
        (target.flight.velocity.y - p.flight.velocity.y) * losY -
        (target.flight.velocity.z - p.flight.velocity.z) * losZ;
      const scanned = Math.abs(Math.atan2(
        Math.sin(azimuth - radar.scanAngle),
        Math.cos(azimuth - radar.scanAngle))) < 0.09;
      let contact = pool[index];
      if (!contact) contact = pool[index] = {};
      contact.id = target.trackId || 0;
      contact.target = target;
      contact.type = target.config.shortName;
      contact.range = range;
      contact.azimuth = azimuth;
      contact.elevation = elevation;
      contact.altDelta = target.flight.position.y - p.flight.position.y;
      contact.closure = closure;
      contact.locked = this.lockCandidate === target;
      contact.scanned = scanned;
      // Relative heading for the top-down aircraft symbol on the TWS scope.
      contact.heading = ((target.flight.heading - p.flight.heading + 540) % 360 -
        180) * DEG;
      contacts.push(contact);
      index++;
    }
    contacts.sort((a, b) => a.range - b.range);
  }

  _updateRwr(dt) {
    const p = this.player;
    if (!p || !p.alive) {
      this.rwr.threats.length = 0;
      this.rwr.locked = false;
      this.rwr.tracked = false;
      this.rwr.search = false;
      this.rwr.missile = false;
      this.rwr.incoming = 0;
      this._rwrWasTracked = false;
      this._rwrWasLocked = false;
      this._rwrMissileActive = false;
      return;
    }
    const rwr = this.rwr;
    const threats = rwr.threats;
    threats.length = 0;
    if (!rwr.threatPool) rwr.threatPool = [];
    const pool = rwr.threatPool;
    const right = p.flight.basis.right;
    const forward = p.flight.basis.forward;
    let index = 0;
    const ids = new Set();
    const newEnemyThreats = [];
    if (!rwr.trackSince) rwr.trackSince = new Map();
    const scannedIds = new Set();

    for (const target of this.enemies) {
      if (!target.alive) continue;
      _tmp.copy(p.flight.position).sub(target.flight.position);
      const dist = _tmp.length();
      if (dist > RWR_SCAN_RANGE || dist < 40) continue;
      const angle = Math.acos(clamp(
        _tmp.multiplyScalar(1 / dist).dot(target.flight.basis.forward), -1, 1));
      if (angle > RWR_SCAN_CONE) continue;
      const ai = this._recordFor(target)?.ai;
      const targetId = target.trackId || 0;
      scannedIds.add(targetId);
      if (!rwr.trackSince.has(targetId)) rwr.trackSince.set(targetId, this.time);
      // Play the tracking warning first, then escalate to lock only after the
      // emitter has held a tight fire-control solution for a moment.
      const trackingFor = this.time - rwr.trackSince.get(targetId);
      const locked = trackingFor > 0.85 && dist < 30000 &&
        ai && ai.target === p;
      const mode = locked ? 'lock' : 'search';
      _tmp.copy(target.flight.position).sub(p.flight.position).normalize();
      const bearing = Math.atan2(_tmp.dot(right), _tmp.dot(forward));
      let threat = pool[index];
      if (!threat) threat = pool[index] = {};
      threat.id = target.trackId || 0;
      threat.model = target.config.shortName || 'UNKNOWN';
      threat.code = target.config.rwrCode || this._rwrCodeFor(target.config);
      threat.type = threat.code;
      threat.emitter = target.config.rwrEmitter ||
        target.config.armament?.missiles?.name || 'RADAR';
      threat.bearing = bearing;
      threat.range = dist;
      threat.altDelta = target.flight.position.y - p.flight.position.y;
      threat.mode = mode;
      threat.missile = false;
      threats.push(threat);
      if (!ids.has(threat.id)) {
        ids.add(threat.id);
        if (!this.rwrIds.has(threat.id)) newEnemyThreats.push(threat);
      }
      index++;
    }
    for (const id of rwr.trackSince.keys()) {
      if (!scannedIds.has(id)) rwr.trackSince.delete(id);
    }

    // Missiles appear as their own RWR emitters, with their own bearing.
    const incoming = this.combat.getIncomingMissiles(p);
    rwr.incoming = incoming.length;
    for (const missile of incoming) {
      _tmp.copy(missile.position).sub(p.flight.position);
      const dist = _tmp.length();
      if (dist < 1) continue;
      _tmp.multiplyScalar(1 / dist);
      const bearing = Math.atan2(_tmp.dot(right), _tmp.dot(forward));
      let threat = pool[index];
      if (!threat) threat = pool[index] = {};
      threat.id = `M${missile.guidance || 'MSL'}`;
      threat.model = 'MISSILE';
      threat.code = 'MSL';
      threat.type = 'MSL';
      threat.emitter = missile.guidance === 'ir' ? 'IR' : 'ARH';
      threat.bearing = bearing;
      threat.range = dist;
      threat.altDelta = missile.position.y - p.flight.position.y;
      threat.mode = 'missile';
      threat.missile = true;
      threats.push(threat);
      index++;
    }

    rwr.tracked = threats.some((t) => !t.missile);
    rwr.locked = threats.some((t) => t.mode === 'lock');
    rwr.missile = incoming.length > 0;
    rwr.search = rwr.tracked;
    rwr.newAt = newEnemyThreats.length ? this.time : rwr.newAt;
    this.rwrIds = ids;

  }

  _fillGunTarget() {
    const player = this.player;
    if (!player) { this.gunTarget = null; return; }
    let best = null;
    let bestScore = Infinity;
    for (const target of this.enemies) {
      if (!target.alive) continue;
      _tmp.copy(target.flight.position).sub(player.flight.position);
      const dist = _tmp.length();
      if (dist > 6200 || dist < 40) continue;
      _tmp.normalize();
      const dot = _tmp.dot(player.flight.basis.forward);
      if (dot < 0.72) continue;
      const score = (1 - dot) * 100 + dist / 1000;
      if (score < bestScore) {
        bestScore = score;
        best = target;
      }
    }
    // Prefer the IRST/radar-locked target so the gun cue and missile cue agree.
    const locked = this.lockCandidate;
    if (locked && locked.alive && locked !== best) {
      _tmp.copy(locked.flight.position).sub(player.flight.position);
      const dist = _tmp.length();
      if (dist <= 6200 && dist >= 40) {
        _tmp.normalize();
        if (_tmp.dot(player.flight.basis.forward) > 0.8) best = locked;
      }
    }
    this.gunTarget = best;
  }

  _cycleLock() {
    const player = this.player;
    if (!player) return;
    const seeker = player.getMissileConfig();
    const candidates = [];
    for (const contact of this.radar.contacts) {
      const target = contact.target;
      if (!target || !target.alive) continue;
      if (contact.range > Math.min(this._weaponLockRange(seeker,target), RADAR_WORK_RANGE)) continue;
      if(seeker.targetType==='emitter'&&target.radarEmitting===false)continue;
      if(this.player.config.systems.seekerLimitedLock&&Math.abs(contact.azimuth)>(seeker.lockAngle||this.radar.azimuth))continue;
      candidates.push({
        target,
        angle: Math.abs(contact.azimuth),
        dist: contact.range,
      });
    }
    if (candidates.length === 0) {
      this.lockCandidate = null;
      this.lockProgress = 0;
      this.lockedTarget = null;
      this.screens.toast('搜索雷达：视距内无目标', { duration: 1400 });
      return;
    }
    candidates.sort((a, b) => a.angle - b.angle || a.dist - b.dist);
    let next = candidates[0];
    if (this.lockCandidate) {
      const idx = candidates.findIndex((c) => c.target === this.lockCandidate);
      if (idx >= 0) next = candidates[(idx + 1) % candidates.length];
    }
    this.lockCandidate = next.target;
    this.lockProgress = 0.001;
    this.screens.toast(`${seeker.radar ? 'RADAR' : 'IR SEEKER'} · ${next.target.config.shortName}`,
      { duration: 1300 });
  }

  /** Space acquires/fires air weapons and releases the selected ground store. */
  _handleMissileKey() {
    const player = this.player;
    if (!player || !player.alive) return;
    if (player.weapons.missiles <= 0) {
      this.screens.toast('挂载武器已耗尽', { duration: 1400, tone: 'danger' });
      return;
    }
    const selected=player.getMissileConfig();
    if(selected.targetType&&selected.targetType!=='air'&&selected.targetType!=='emitter'){
      const f=player.flight,forward=new THREE.Vector3(Math.sin(this.viewYaw)*Math.cos(this.viewPitch),Math.sin(this.viewPitch),-Math.cos(this.viewYaw)*Math.cos(this.viewPitch));
      let hit=null;const step=120,range=Math.min(selected.maxRange||30000,300000);for(let t=step;t<=range;t+=step){const p=f.position.clone().addScaledVector(forward,t),ground=this.world.groundHeight(p.x,p.z);if(p.y<=ground){p.y=ground;hit=p;break;}}
      if(!hit){this.screens.toast('请将视线指向地面目标点',{duration:2000});return;}
      const target={alive:true,isGroundTarget:true,team:'red',flight:{position:hit,velocity:new THREE.Vector3()},takeDamage(){}};
      if(this.combat.launchMissile(player,target))this.screens.toast(selected.name+' 已向地面瞄准点释放',{duration:1800});return;
    }
    if (this.lockCandidate && this.lockCandidate.alive) {
      if (this.lockProgress >= 1) {
        this._launchPlayerMissile();
      } else {
        this.screens.toast('导引头截获中 · 等待锁定环闭合',
          { duration: 1000 });
      }
      return;
    }
    this._cycleLock();
  }

  _launchPlayerMissile() {
    const player = this.player;
    if (!player || !player.alive) return;
    if (this.lockProgress < 1 || !this.lockCandidate || !this.lockCandidate.alive) {
      this.screens.toast('导弹未锁定 · 按 ' + this.input.bindingLabel('weaponFire') + ' 截获目标',
        { duration: 1600, tone: 'danger' });
      return;
    }
    const missile = player.getMissileConfig();
    const dist = player.flight.position.distanceTo(this.lockCandidate.flight.position);
    if (dist > missile.maxRange) {
      this.screens.toast('目标超出导弹射程', { duration: 1600, tone: 'danger' });
      return;
    }
    if (player.weapons.missiles <= 0) {
      this.screens.toast('导弹已耗尽', { duration: 1600, tone: 'danger' });
      return;
    }
    if (this.combat.launchMissile(player, this.lockCandidate)) {
      this.cameraRig.kick(0.75);
      this.screens.toast(`${missile.guidance==='antiRadiation'?'反辐射发射':missile.radar ? 'FOX THREE' : 'FOX TWO'} · ${missile.name} 发射`,
        { duration: 1800, tone: 'good' });
      this.audio.callout('vws_missile_launch', '发射导弹。', {
        priority: true,
      });
    }
  }

  _weaponLockRange(weapon,target){
    // systems.seekerLimitedLock: lock range per seeker (radar missiles to their
    // max range, IR rear-aspect range) and lock angle limited by the seeker.
    if(!this.player.config.systems.seekerLimitedLock)return weapon.lockRange;
    if(weapon.guidance==='activeRadar')return Math.min(weapon.maxRange,RADAR_WORK_RANGE);
    if(weapon.irSeeker&&target?.flight?.basis?.forward){const rel=this.player.flight.position.clone().sub(target.flight.position).normalize();return rel.dot(target.flight.basis.forward)<-.5?(weapon.rearLockRange||weapon.lockRange):weapon.lockRange;}
    return weapon.lockRange;
  }

  _updateGStress(dt) {
    const p = this.player;
    if (!p || !p.alive) return;
    const g = p.gLoad;
    if (!p.onGround && Number.isFinite(g)) {
      this.peakG = Math.max(Number.isFinite(this.peakG) ? this.peakG : 1, g);
    }
    if (!p.onGround && g > 6.2) {
      this.gStress += (g - 6.2) * 0.09 * dt;
    } else {
      this.gStress -= 0.28 * dt;
    }
    if (g < -1.4) this.redout += (-g - 1.4) * 0.13 * dt;
    else this.redout -= 0.35 * dt;
    this.gStress = clamp(this.gStress, 0, 1.05);
    this.redout = clamp(this.redout, 0, 1);
  }

  _refreshEnemyList() {
    this.enemies = this.enemyRecords
      .filter((r) => r.aircraft.alive)
      .map((r) => r.aircraft);
    if (this.lockCandidate && !this.lockCandidate.alive) {
      this.lockCandidate = null;
      this.lockProgress = 0;
    }
  }

  _recordFor(aircraft) {
    return aircraft.isPlayer ? this.playerRecord :
      this.enemyRecords.find((r) => r.aircraft === aircraft);
  }

  _rwrCodeFor(config) {
    const text = `${config?.shortName || ''} ${config?.name || ''}`;
    const table = [
      [/miG-?29/i, 'M29'],
      [/su-?30/i, 'S30'],
      [/j-?10/i, 'J10'],
      [/f-?16/i, 'F16'],
      [/f-?15/i, 'F15'],
      [/su-?27/i, 'S27'],
      [/su-?35/i, 'S35'],
      [/j-?11/i, 'J11'],
      [/j-?20/i, 'J20'],
    ];
    for (const [pattern, code] of table) {
      if (pattern.test(text)) return code;
    }
    return text.replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase() || 'UNK';
  }

  allAircraft() {
    const list = [];
    if (this.player && this.player.alive) list.push(this.player);
    for (const record of this.enemyRecords) {
      if (record.aircraft.alive) list.push(record.aircraft);
    }
    return list;
  }

  pause() {
    if (this.state !== 'playing') return;
    this.previousState = this.state;
    this._resetFreeLook();
    this.state = 'paused';
    this._resetAltMouse();
    this.input.setEnabled(false);
    this.input.exitPointerLock();
    this.audio.suspend();
    this.screens.showPause();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.screens.hidePause();
    this.screens.hideSettings();
    this.screens.hideHelp();
    this.state = 'playing';
    this.audio.resume();
    this.lastFrame = performance.now();
    this.accumulator = 0;
    this.fps = 60;
    this._resetFreeLook();
    this.input.setEnabled(true);
    this.input.clear();
    this.input.requestPointerLock();
  }

  async restart() {
    const mode = this.mode;
    this.screens.hidePause();
    this.screens.hideSettings();
    this.screens.hideHelp();
    this.screens.hideDeath();
    this.audio.resume();
    await this.start(mode);
  }

  async respawn() {
    this.screens.hideDeath();
    this._teardownFlight();
    this.score = 0;
    this.kills = 0;
    this.killStreak = 0;
    this.lastKillTime = -99;
    this.destroyNoticeTimer = 0;
    this._lastHighGVoice = -99;
    this.peakG = 1;
    this.wave = 1;
    this.lockCandidate = null;
    this.lockProgress = 0;
    this.lockedTarget = null;
    this.gStress = 0;
    this.redout = 0;
    this.missionTime = 0;
    this.killfeed = [];
    this.cockpitWarnings.reset();
    this.audio.resetVoice();
    this.nextTrackId = 1;
    this.rwr = {
      threats: [], locked: false, tracked: false, search: false,
      missile: false, incoming: 0, newAt: -99,
    };
    this.rwrIds = new Set();
    this.radar.contacts = [];
    this.radar.range = DEFAULT_RADAR_RANGE;
    this.radar.azimuth = 85 * DEG;
    this.radar.elevation = 60 * DEG;
    this.radar.scanAngle = -85 * DEG;
    this.radar.scanDir = 1;
    this._seenRadarIds.clear();
    this._lastRadarAlert = -99;
    this._lastRwrVoiceTime = -99;
    this._rwrWasTracked = false;
    this._rwrWasLocked = false;
    this._rwrMissileActive = false;
    this._missileVoiceTimer = 0;
    this.statusFeed = [];
    this.effects.clear();
    this.combat.reset();
    this.health = 100;
    this.state = 'playing';
    this.hasTakenOff = true;
    this.throttleTarget = 0.9;
    this.waveState = this.mode === 'test' ? 'inactive' : 'intermission';
    this.waveTimer = 4;
    this._spawnPlayer('instant', { forceAir: true });
    this.cameraMode = 'chase';
    this.mapOpen = false;
    this.cameraRig.setMode('chase');
    this.cameraRig.reset();
    this._resetFreeLook();
    this.playerJet.setCockpitView(false);
    this.input.setEnabled(true);
    this.input.clear();
    this._resetAltMouse();
    this.input.requestPointerLock();
    this.screens.enterFlight();
    this.audio.resume();
    this.lastFrame = performance.now();
    this.accumulator = 0;
    this.fps = 60;
    this.screens.toast('备机升空 · 重新加入战斗', { duration: 2600, tone: 'good' });
  }

  async returnToMenu() {
    this.audio.suspend();
    this._resetAltMouse();
    this.input.exitPointerLock();
    this._removeShowcase();
    this._teardownFlight();
    this.effects.clear();
    this.combat.reset();
    this.screens.hidePause();
    this.screens.hideSettings();
    this.screens.hideHelp();
    this.screens.hideDeath();
    this.state = 'menu';
    this.screens.showMenu();
    this.screens.showHangar();
    this.screens.setStartEnabled(true);
    this._createShowcase();
    this.state = 'menu';
    this.lastFrame = performance.now();
    this.accumulator = 0;
  }
}

function frame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}
