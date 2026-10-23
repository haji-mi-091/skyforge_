/**
 * DOM shell for menus, modals and notifications. Gameplay state changes are
 * requested through callbacks; this class never touches the simulation.
 */
import {
  STORE_TYPES, STATIONS, STORE_CATEGORIES, DEFAULT_PRESETS,
  LOADOUT_JETS, hasLoadout, storeOffered,
  loadHangarState, saveHangarState,
  getAircraftHangar, getActivePreset, clonePreset, presetMass,
  presetCounts,
} from '../data/hangar.js';
import { AIRCRAFT_TYPES } from '../data/aircraft.js';
import {CONTROL_ACTIONS,normalizeBindings,normalizeChord,eventKeyCodes,normalizeKeyCode,formatBinding,formatChord} from '../data/controls.js';

// Liveries come from each aircraft's config.visual.paints; the choice is
// stored per aircraft in localStorage 'skyforge.<id>.paint'.
const paintsOf = (id) => AIRCRAFT_TYPES[id]?.visual.paints;
const paintKey = (id) => `skyforge.${id}.paint`;

import { VOICE_PACKS } from '../data/voicePacks.js';

const STORAGE_KEY = 'skyforge.settings.v1';

const DEFAULT_SETTINGS = {
  quality: 'high',
  sensitivity: 1.0,
  invertY: false,
  volume: 0.6,
  engineVolume: 0.8,
  alertVolume: 0.8,
  voicePack: 'yuuka',
  muted: false,
  pitchLadder: false,
  keyBindings: null,
};

function $(id) {
  return document.getElementById(id);
}

/** Replace an element's content with text lines separated by <br>. */
function setLines(el, lines) {
  el.replaceChildren(...lines.flatMap((line, i) => (i ? [document.createElement('br'), line] : [line])));
}

export class Screens {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.loading = $('loading');
    this.loadingFill = $('loading-fill');
    this.loadingText = $('loading-text');
    this.menu = $('menu');
    this.hangarScreen = $('hangar');
    this.pause = $('pause');
    this.settings = $('settings');
    this.help = $('help');
    this.death = $('death');
    this.toasts = $('toasts');

    this.quality = $('setting-quality');
    this.sensitivity = $('setting-sens');
    this.sensitivityValue = $('setting-sens-value');
    this.invert = $('setting-invert');
    this.volume = $('setting-volume');
    this.volumeValue = $('setting-volume-value');
    this.engineVolume = $('setting-engine-volume');
    this.engineVolumeValue = $('setting-engine-volume-value');
    this.alertVolume = $('setting-alert-volume');
    this.alertVolumeValue = $('setting-alert-volume-value');
    this.mute = $('setting-mute');
    this.voicePack = $('setting-voice');
    this.voicePack.replaceChildren(...Object.entries(VOICE_PACKS).map(
      ([id, pack]) => new Option(pack.label, id)));
    this.aircraft = 'f16cm-block52';
    this.aircraftButtons = [...document.querySelectorAll('[data-aircraft]')];
    this.specTag = $('spec-tag');
    this.specName = $('spec-name');
    this.specNote = $('spec-note');

    this.hangarState = loadHangarState();
    this.hangarPanel = $('hangar-panel');
    this.hangarAircraft = $('hangar-aircraft');
    this.hangarLoadoutTag = $('hangar-loadout-tag');
    this.hangarStatus = document.querySelector('.hangar-screen-status');
    this.hangarSpecTag = document.querySelector('.hangar-screen-spec .spec-tag');
    this.hangarSpecName = document.querySelector('.hangar-screen-spec .spec-name');
    this.hangarStationCount = $('hangar-station-count');
    this.hangarMass = $('hangar-mass');
    this.hangarPreset = $('hangar-preset');
    this.hangarSlots = $('hangar-slots');
    this.hangarCatalog = $('hangar-catalog');
    this.hangarActiveStore = $('hangar-active-store');
    this.hangarSummary = $('hangar-summary');
    this.hangarStoreId = null;
    this.hangarSlotId = null;
    this.hangarPaintRow = $('hangar-paint-row');
    this.hangarPaint = $('hangar-paint');
    this.paints = {};
    for (const [id, config] of Object.entries(AIRCRAFT_TYPES)) {
      const paint = config.visual.paints;
      if (!paint) continue;
      let stored = null;
      try { stored = localStorage.getItem(paintKey(id)); } catch { /* private mode */ }
      if (stored === 'base') stored = 'service';   // livery id renamed (was 'base')
      this.paints[id] = paint.options.some(([value]) => value === stored) ? stored : paint.default;
    }
    this.hangarLoadoutOpen = $('hangar-loadout-open');

    this.settingsState = this._loadSettings();
    this.settingsState.keyBindings = normalizeBindings(this.settingsState.keyBindings);
    this.bindingCapture = null;
    this._syncSettingsUI();
    this._bind();
    this._bindHangar();
    this.setLoadoutPanelOpen(true);
    this._refreshHangar();
  }

  _loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch (err) {
      // Local storage can be unavailable in privacy modes; defaults are fine.
    }
    return { ...DEFAULT_SETTINGS };
  }

  _saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settingsState));
    } catch (err) { /* ignore */ }
  }

  _syncSettingsUI() {
    const s = this.settingsState;
    this.quality.value = s.quality;
    this.sensitivity.value = s.sensitivity;
    this.sensitivityValue.textContent = Number(s.sensitivity).toFixed(2);
    this.invert.checked = !!s.invertY;
    this.volume.value = s.volume;
    this.volumeValue.textContent = `${Math.round(s.volume * 100)}%`;
    this.engineVolume.value = s.engineVolume;
    this.engineVolumeValue.textContent =
      `${Math.round(s.engineVolume * 100)}%`;
    this.alertVolume.value = s.alertVolume;
    this.alertVolumeValue.textContent =
      `${Math.round(s.alertVolume * 100)}%`;
    this.mute.checked = !!s.muted;
    this.voicePack.value = VOICE_PACKS[s.voicePack] ? s.voicePack : 'yuuka';
    this._renderBindings();
    this._syncBindingLabels();
  }

  _renderBindings() {
    const list = $('key-bindings');
    list.replaceChildren();
    let group;
    for (const action of CONTROL_ACTIONS) {
      if (group !== action.group) {
        group = action.group;
        const title = document.createElement('h3');
        title.textContent = group;
        list.appendChild(title);
      }
      const row = document.createElement('div');
      row.className = 'binding-row';
      row.dataset.bindingAction = action.id;
      row.innerHTML = '<span class="binding-name"></span><kbd class="binding-value"></kbd>' +
        '<div class="binding-buttons"><button type="button" class="action-btn binding-edit">修改</button>' +
        '<button type="button" class="action-btn binding-default">默认</button></div>' +
        '<div class="binding-editor hidden"><div class="binding-prompt" role="status" aria-live="polite"></div>' +
        '<div class="binding-buttons"><button type="button" class="action-btn primary binding-confirm" disabled>确定</button>' +
        '<button type="button" class="action-btn binding-cancel">取消</button></div></div>';
      row.querySelector('.binding-name').textContent = action.label;
      row.querySelector('.binding-value').textContent = formatBinding(this.settingsState.keyBindings, action.id);
      row.querySelector('.binding-edit').addEventListener('click', () => this._captureBinding(action, row));
      row.querySelector('.binding-default').addEventListener('click', () => {
        this._cancelBinding();
        this.settingsState.keyBindings[action.id] = action.keys.map((keys) => [...keys]);
        this._saveBindings();
      });
      row.querySelector('.binding-confirm').addEventListener('click', () => {
        const capture = this.bindingCapture;
        if (!capture || capture.action.id !== action.id || !capture.candidate) return;
        this.settingsState.keyBindings[action.id] = [[...capture.candidate]];
        this._cancelBinding();
        this._saveBindings();
      });
      row.querySelector('.binding-cancel').addEventListener('click', () => this._cancelBinding());
      list.appendChild(row);
    }
  }

  _captureBinding(action, row) {
    this._cancelBinding();
    this.bindingCapture = {action,row,held:new Set(),candidate:null};
    row.classList.add('capturing');
    row.querySelector('.binding-editor').classList.remove('hidden');
    row.querySelector('.binding-prompt').textContent = '请按下单键或同时按下组合键，再用鼠标点击“确定”。';
    row.querySelector('.binding-confirm').disabled = true;
    row.scrollIntoView({block:'nearest'});
  }

  _cancelBinding() {
    const capture = this.bindingCapture;
    if (!capture) return;
    capture.row.classList.remove('capturing');
    capture.row.querySelector('.binding-editor').classList.add('hidden');
    this.bindingCapture = null;
  }

  _saveBindings() {
    this._saveSettings();
    this._applySettings();
    this._renderBindings();
    this._syncBindingLabels();
  }

  _syncBindingLabels() {
    const bindings = this.settingsState.keyBindings;
    document.querySelectorAll('[data-binding]').forEach((element) => {
      element.textContent = formatBinding(bindings, element.dataset.binding);
    });
    $('pause-keys').textContent = [
      ['pause','继续'],['canopy','座舱盖'],['freeLook','自由视角'],['targetNext','目标'],
      ['weaponNext','武器'],['cannonBelt','弹链'],['radarRange','雷达'],['mouseCapture','鼠标'],
      ['flaps','着陆襟翼'],['takeoffFlaps','起飞襟翼'],['camera','座舱'],
    ].map(([id,label]) => `${formatBinding(bindings,id)} ${label}`).join(' · ');
    $('help-fire-note').textContent = `按 ${formatBinding(bindings,'weaponFire')} 截获目标；锁定环闭合后再次按下发射。机炮使用 ${formatBinding(bindings,'gunFire')}，将中央炮口十字对准黄色提前量圆环。`;
  }

  _readSettingsUI() {
    this.settingsState.quality = this.quality.value;
    this.settingsState.sensitivity = Number(this.sensitivity.value);
    this.settingsState.invertY = this.invert.checked;
    this.settingsState.volume = Number(this.volume.value);
    this.settingsState.engineVolume = Number(this.engineVolume.value);
    this.settingsState.alertVolume = Number(this.alertVolume.value);
    this.settingsState.muted = this.mute.checked;
    this.settingsState.voicePack = this.voicePack.value;
    this.sensitivityValue.textContent =
      Number(this.settingsState.sensitivity).toFixed(2);
    this.volumeValue.textContent =
      `${Math.round(this.settingsState.volume * 100)}%`;
    this.engineVolumeValue.textContent =
      `${Math.round(this.settingsState.engineVolume * 100)}%`;
    this.alertVolumeValue.textContent =
      `${Math.round(this.settingsState.alertVolume * 100)}%`;
    this._saveSettings();
    this._applySettings();
  }

  _applySettings() {
    this.callbacks.onSettingsChange?.(this.settingsState);
  }

  _stations() {
    return LOADOUT_JETS[this.aircraft]?.stations ?? STATIONS;
  }

  _hangarPreset() {
    return getActivePreset(this.hangarState, this.aircraft);
  }

  _saveHangar() {
    // Payload limits: an invalid edit reverts to the last valid loadout.
    const error=LOADOUT_JETS[this.aircraft]?.error(this._hangarPreset().loadout);
    if(error){this._hangarPreset().loadout={...this._lastValidLoadout};this.toast(error,{tone:'danger',duration:2400});this._refreshHangar();return;}
    this._lastValidLoadout={...this._hangarPreset().loadout};
    saveHangarState(this.hangarState);
    this._refreshHangar();
    this.callbacks.onLoadoutChange?.(this.getLoadout());
  }

  _bindHangar() {
    this.hangarPreset?.addEventListener('change', () => {
      const hangar = getAircraftHangar(this.hangarState, this.aircraft);
      hangar.active = Math.max(0, Number(this.hangarPreset.value) || 0);
      this.hangarSlotId = null;
      this._saveHangar();
      this._click();
    });
    document.querySelectorAll('[data-hangar-preset]').forEach((button) => {
      button.addEventListener('click', () => {
        const hangar = getAircraftHangar(this.hangarState, this.aircraft);
        const step = Number(button.dataset.hangarPreset) || 1;
        hangar.active = (hangar.active + step + hangar.presets.length) %
          hangar.presets.length;
        this.hangarSlotId = null;
        this._saveHangar();
        this._click();
      });
    });
    $('hangar-new')?.addEventListener('click', () => {
      const hangar = getAircraftHangar(this.hangarState, this.aircraft);
      const name = window.prompt('新预设名称', `预设 ${hangar.presets.length + 1}`);
      if (!name) return;
      hangar.presets.push({ ...clonePreset(hangar.presets[hangar.active], this.aircraft), name });
      hangar.active = hangar.presets.length - 1;
      this._saveHangar();
    });
    $('hangar-delete')?.addEventListener('click', () => {
      const hangar = getAircraftHangar(this.hangarState, this.aircraft);
      if (hangar.presets.length <= 1) return;
      if (!window.confirm(`删除预设「${hangar.presets[hangar.active].name}」？`)) return;
      hangar.presets.splice(hangar.active, 1);
      hangar.active = Math.min(hangar.active, hangar.presets.length - 1);
      this._saveHangar();
    });
    this.hangarPaint?.addEventListener('change', () => {
      this.setPaint(this.hangarPaint.value);
      this._click();
    });
    this.hangarLoadoutOpen?.addEventListener('click', () => { this.setLoadoutPanelOpen(true); this._click(); });
    $('hangar-loadout-close')?.addEventListener('click', () => { this.setLoadoutPanelOpen(false); this._click(); });
    $('hangar-default')?.addEventListener('click', () => {
      const hangar = getAircraftHangar(this.hangarState, this.aircraft);
      hangar.presets[hangar.active] = clonePreset(
        (LOADOUT_JETS[this.aircraft]?.presets ?? DEFAULT_PRESETS)[0], this.aircraft);
      this._saveHangar();
    });
    $('hangar-clear')?.addEventListener('click', () => {
      const preset = this._hangarPreset();
      for (const station of this._stations()) preset.loadout[station.id] = null;
      this.hangarSlotId = null;
      this._saveHangar();
    });
    this.hangarSlots?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-slot]');
      if (!button) return;
      const slotId = button.dataset.slot;
      const preset = this._hangarPreset();
      const station = this._stations().find((s) => s.id === slotId);
      if (!station) return;
      this.hangarSlotId = slotId;
      if (this.hangarStoreId && station.allowed.includes(this.hangarStoreId)) {
        preset.loadout[slotId] = this.hangarStoreId;
        this._saveHangar();
      } else {
        this._refreshHangar();
      }
    });
    this.hangarSlots?.addEventListener('contextmenu', (event) => {
      const button = event.target.closest('[data-slot]');
      if (!button) return;
      event.preventDefault();
      const preset = this._hangarPreset();
      preset.loadout[button.dataset.slot] = null;
      this._saveHangar();
    });
    this.hangarCatalog?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-store]');
      if (!button) return;
      this.hangarStoreId = button.dataset.store;
      const preset = this._hangarPreset();
      let slotId = this.hangarSlotId;
      const stations = this._stations();
      const slot = stations.find((s) => s.id === slotId);
      if (!slot || !slot.allowed.includes(this.hangarStoreId)) {
        const free = stations.find((s) => s.allowed.includes(this.hangarStoreId) &&
          !preset.loadout[s.id]);
        const any = stations.find((s) => s.allowed.includes(this.hangarStoreId));
        slotId = (free || any)?.id || null;
        this.hangarSlotId = slotId;
        if (slotId) preset.loadout[slotId] = this.hangarStoreId;
      } else {
        preset.loadout[slotId] = this.hangarStoreId;
      }
      this._saveHangar();
    });
  }

  _refreshHangar() {
    if (!this.hangarPanel) return;
    this.hangarPanel.classList.toggle('unavailable', !hasLoadout(this.aircraft));
    const hangar = getAircraftHangar(this.hangarState, this.aircraft);
    const preset = this._hangarPreset();
    const text = AIRCRAFT_TYPES[this.aircraft]?.visual.hangar;
    if (text) {
      if (this.hangarAircraft) this.hangarAircraft.textContent = text.title;
      if (this.hangarLoadoutTag) this.hangarLoadoutTag.textContent = text.loadoutTag;
      if (this.hangarStatus) this.hangarStatus.textContent = `${text.code} // READY`;
      if (this.hangarSpecTag) this.hangarSpecTag.textContent = `${text.code} // HANGAR`;
      if (this.hangarSpecName) setLines(this.hangarSpecName, text.name);
      for (const dl of document.querySelectorAll('.menu-spec dl,.hangar-screen-spec dl')) {
        const cells = dl.querySelectorAll('dd');
        text.specs.forEach((value, i) => { if (cells[i]) cells[i].textContent = value; });
      }
    }
    if (this.hangarStationCount) {
      this.hangarStationCount.textContent = String(this._stations().length);
    }
    if (this.hangarPreset) {
      this.hangarPreset.innerHTML = hangar.presets.map((p, i) =>
        `<option value="${i}">${p.name}</option>`).join('');
      this.hangarPreset.value = String(hangar.active);
    }
    if (this.hangarMass) {
      this.hangarMass.textContent = `${Math.round(presetMass(preset))} KG`;
    }
    if (this.hangarSlots) {
      this.hangarSlots.style.setProperty('--slot-count', String(this._stations().length));
      this.hangarSlots.innerHTML = this._stations().map((station) => {
        const store = STORE_TYPES[preset.loadout[station.id]];
        const filled = store ? 'filled' : 'empty';
        const active = this.hangarSlotId === station.id ? ' active' : '';
        return `<button type="button" class="hangar-slot ${filled}${active}" data-slot="${station.id}" title="${station.name} · 右键清空">
          <b>${station.label}</b><em>${store ? store.short : '—'}</em>
        </button>`;
      }).join('');
    }
    if (this.hangarCatalog) {
      this.hangarCatalog.innerHTML = STORE_CATEGORIES.map((category) => {
        const items = Object.values(STORE_TYPES)
          .filter((store) => !store.hidden && store.category === category.id && storeOffered(store, this.aircraft))
          .map((store) => `<button type="button" class="hangar-store${this.hangarStoreId === store.id ? ' selected' : ''}" data-store="${store.id}" title="${store.name} · ${store.mass} kg">${store.short}</button>`)
          .join('');
        return items ? `<div class="hangar-cat-section"><span class="hangar-cat-label">${category.label}</span><div class="hangar-cat-items">${items}</div></div>` : '';
      }).join('');
    }
    if (this.hangarActiveStore) {
      this.hangarActiveStore.textContent = this.hangarStoreId
        ? `已选 ${STORE_TYPES[this.hangarStoreId].name} · 点击挂点安装`
        : '选择一类挂载';
    }
    if (this.hangarSummary) {
      const counts = presetCounts(preset);
      const loadoutText = Object.entries(counts)
        .map(([id, count]) => `${STORE_TYPES[id]?.short || id}×${count}`)
        .join(' · ') || '空挂载';
      this.hangarSummary.textContent = `${loadoutText}   |   右键挂点清空`;
    }
    const paints = paintsOf(this.aircraft);
    this.hangarPaintRow?.classList.toggle('hidden', !paints);
    if (this.hangarPaint && paints) {
      this.hangarPaint.replaceChildren(...paints.options.map(([value, label]) => new Option(label, value)));
      this.hangarPaint.value = this.paints[this.aircraft];
    }
  }

  getLoadout() {
    if (!hasLoadout(this.aircraft)) return null;
    return { ...this._hangarPreset().loadout };
  }

  /** Selected livery id for an aircraft (config.visual.paints); undefined if it has none. */
  getPaint(id = this.aircraft) {
    return this.paints[id];
  }

  /** Select a livery for the current aircraft; ignores ids it does not offer. */
  setPaint(paint) {
    if (!paintsOf(this.aircraft)?.options.some(([value]) => value === paint)) return;
    this.paints[this.aircraft] = paint;
    try { localStorage.setItem(paintKey(this.aircraft), paint); } catch { /* private mode */ }
    if (this.hangarPaint) this.hangarPaint.value = paint;
    this.callbacks.onPaintChange?.(paint);
  }

  /** Show or collapse the hangar loadout panel ("挂载选择" / "收起"). */
  setLoadoutPanelOpen(open) {
    this.hangarPanel?.classList.toggle('collapsed', !open);
    this.hangarLoadoutOpen?.classList.toggle('active', open);
    this.hangarLoadoutOpen?.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  getPreset() {
    return this._hangarPreset();
  }

  _bind() {
    window.addEventListener('keydown', (event) => {
      const capture = this.bindingCapture;
      if (!capture) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) return;
      const code = normalizeKeyCode(event.code);
      if (!code) return;
      const codes = eventKeyCodes(event, capture.held);
      capture.held = codes;
      capture.candidate = normalizeChord([...codes]);
      capture.row.querySelector('.binding-prompt').textContent = '待保存：' + formatChord(capture.candidate) + ' · 请用鼠标点击“确定”';
      capture.row.querySelector('.binding-confirm').disabled = false;
    }, true);
    window.addEventListener('keyup', (event) => {
      if (!this.bindingCapture) return;
      event.preventDefault();
      // Input must still release keys that were held before capture began.
      this.bindingCapture.held.delete(normalizeKeyCode(event.code));
    }, true);
    window.addEventListener('blur', () => this.bindingCapture?.held.clear());
    $('binding-settings').addEventListener('toggle', () => {
      if (!$('binding-settings').open) this._cancelBinding();
    });
    $('bindings-default').addEventListener('click', () => {
      this._cancelBinding();
      this.settingsState.keyBindings = normalizeBindings();
      this._saveBindings();
    });
    document.querySelectorAll('[data-action]').forEach((el) => {
      el.addEventListener('click', () => {
        const action = el.dataset.action;
        if (action !== 'start') this._click();
        this._handleAction(action, el);
      });
    });
    for (const input of [this.quality, this.sensitivity, this.invert,
      this.volume, this.engineVolume, this.alertVolume, this.mute, this.voicePack]) {
      input.addEventListener('input', () => this._readSettingsUI());
      input.addEventListener('change', () => this._readSettingsUI());
    }
    for (const button of this.aircraftButtons) {
      button.addEventListener('click', () => this.selectAircraft(button.dataset.aircraft));
    }
    this._onFullscreenChange = () => this._updateFullscreenLabels();
    document.addEventListener('fullscreenchange', this._onFullscreenChange);
  }

  _handleAction(action, el) {
    switch (action) {
      case 'start':
        if (el.disabled) return;
        this.callbacks.onStart?.(el.dataset.mode || 'instant', this.aircraft,
          this.getLoadout());
        break;
      case 'resume':
        this.callbacks.onResume?.();
        break;
      case 'restart':
        this.callbacks.onRestart?.();
        break;
      case 'menu':
        this.callbacks.onMenu?.();
        break;
      case 'hangar':
        this.showHangar();
        break;
      case 'close-hangar':
        this.hideHangar();
        break;
      case 'respawn':
        this.callbacks.onRespawn?.();
        break;
      case 'help':
        this.showHelp();
        break;
      case 'close-help':
        this.hideHelp();
        break;
      case 'settings':
        this.showSettings();
        break;
      case 'close-settings':
        this.hideSettings();
        break;
      case 'fullscreen':
        this.toggleFullscreen();
        break;
      default:
        break;
    }
  }

  _click() {
    this.callbacks.onUiSound?.();
  }

  selectAircraft(id) {
    // Hangar aircraft are the ones with an editable loadout.
    if (!hasLoadout(id)) return;
    const selected = id;
    this.aircraft = selected;
    for (const button of this.aircraftButtons) {
      const active = button.dataset.aircraft === selected;
      button.classList.toggle('selected', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    const text = AIRCRAFT_TYPES[selected].visual.hangar;
    if (this.specTag) this.specTag.textContent = text.menuTag;
    if (this.specName) setLines(this.specName, text.name);
    if (this.specNote) this.specNote.textContent = text.note;
    this._lastValidLoadout = { ...this._hangarPreset().loadout };
    this._refreshHangar();
    this.callbacks.onAircraftChange?.(selected);
  }

  setLoading(progress, text) {
    this.loadingFill.style.width = `${Math.round(progress * 100)}%`;
    if (text) this.loadingText.textContent = text;
  }

  hideLoading() {
    this.loading.classList.add('hidden');
  }

  showMenu() {
    this._cancelBinding();
    this.menu.classList.remove('hidden');
    this.hangarScreen?.classList.add('hidden');
    this.pause.classList.add('hidden');
    this.settings.classList.add('hidden');
    this.help.classList.add('hidden');
    this.death.classList.add('hidden');
    document.body.classList.remove('in-flight');
    document.body.classList.remove('modal-open');
  }

  showHangar() {
    this._cancelBinding();
    this._refreshHangar();
    this.menu.classList.add('hidden');
    this.hangarScreen?.classList.remove('hidden');
    this.pause.classList.add('hidden');
    this.settings.classList.add('hidden');
    this.help.classList.add('hidden');
    this.death.classList.add('hidden');
    document.body.classList.remove('modal-open');
  }

  hideHangar() {
    this.hangarScreen?.classList.add('hidden');
    this.menu.classList.remove('hidden');
  }

  hideMenu() {
    this.menu.classList.add('hidden');
    this.hangarScreen?.classList.add('hidden');
  }

  setStartEnabled(enabled) {
    document.querySelectorAll('[data-action="start"]').forEach((el) => {
      el.disabled = !enabled;
    });
  }

  enterFlight() {
    this._cancelBinding();
    this.menu.classList.add('hidden');
    this.hangarScreen?.classList.add('hidden');
    this.pause.classList.add('hidden');
    this.settings.classList.add('hidden');
    this.help.classList.add('hidden');
    this.death.classList.add('hidden');
    document.body.classList.add('in-flight');
    document.body.classList.remove('modal-open');
  }

  showPause() {
    this.pause.classList.remove('hidden');
    document.body.classList.add('modal-open');
  }

  hidePause() {
    this.pause.classList.add('hidden');
    if (this.settings.classList.contains('hidden') &&
      this.help.classList.contains('hidden')) {
      document.body.classList.remove('modal-open');
    }
  }

  showSettings() {
    this.settings.classList.remove('hidden');
    document.body.classList.add('modal-open');
  }

  hideSettings() {
    this._cancelBinding();
    this.settings.classList.add('hidden');
    if (this.pause.classList.contains('hidden') &&
      this.help.classList.contains('hidden')) {
      document.body.classList.remove('modal-open');
    }
  }

  showHelp() {
    this.help.classList.remove('hidden');
    document.body.classList.add('modal-open');
  }

  hideHelp() {
    this.help.classList.add('hidden');
    if (this.pause.classList.contains('hidden') &&
      this.settings.classList.contains('hidden')) {
      document.body.classList.remove('modal-open');
    }
  }

  get modalOpen() {
    return !this.settings.classList.contains('hidden') ||
      !this.help.classList.contains('hidden');
  }

  closeModal() {
    if (!this.settings.classList.contains('hidden')) {
      this.hideSettings();
      return true;
    }
    if (!this.help.classList.contains('hidden')) {
      this.hideHelp();
      return true;
    }
    return false;
  }

  showDeath({ reason, score, kills, time }) {
    $('death-reason').textContent = reason ||
      '战机结构失效，任务终止。';
    $('death-score').textContent = String(score || 0).padStart(6, '0');
    $('death-kills').textContent = String(kills || 0);
    $('death-time').textContent = time || '00:00';
    this.death.classList.remove('hidden');
    document.body.classList.remove('in-flight');
    document.body.classList.add('modal-open');
  }

  hideDeath() {
    this.death.classList.add('hidden');
    document.body.classList.add('in-flight');
    document.body.classList.remove('modal-open');
  }

  setMuted(muted) {
    this.settingsState.muted = !!muted;
    this.mute.checked = !!muted;
    this._saveSettings();
  }

  togglePitchLadder() {
    this.settingsState.pitchLadder = !this.settingsState.pitchLadder;
    this._saveSettings();
    return this.settingsState.pitchLadder;
  }

  toast(text, { duration = 2400, tone = 'normal' } = {}) {
    const el = document.createElement('div');
    el.className = 'toast';
    if (tone === 'danger') el.style.borderLeftColor = 'var(--red)';
    if (tone === 'good') el.style.borderLeftColor = 'var(--green)';
    el.textContent = text;
    this.toasts.appendChild(el);
    window.setTimeout(() => {
      el.classList.add('out');
      window.setTimeout(() => el.remove(), 500);
    }, duration);
    while (this.toasts.children.length > 4) {
      this.toasts.firstElementChild.remove();
    }
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  _updateFullscreenLabels() {
    const active = !!document.fullscreenElement;
    document.querySelectorAll('[data-action="fullscreen"]').forEach((el) => {
      el.textContent = active ? '退出全屏' : '切换全屏';
    });
  }
}
