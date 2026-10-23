import { Game } from './core/Game.js';
import { Screens } from './ui/Screens.js';

const canvas = document.getElementById('scene');
const hudCanvas = document.getElementById('hud');
const params = new URLSearchParams(window.location.search);

let game;

const screens = new Screens({
  onStart: (mode, aircraft, loadout) => game?.start(mode, aircraft, loadout),
  onAircraftChange: (aircraft) => game?.setPreviewAircraft(aircraft),
  onLoadoutChange: (loadout) => game?.setPreviewLoadout(loadout),
  onPaintChange: (paint) => game?.setPreviewPaint(paint),
  onResume: () => game?.resume(),
  onRestart: () => game?.restart(),
  onMenu: () => game?.returnToMenu(),
  onRespawn: () => game?.respawn(),
  onSettingsChange: (settings) => game?.applySettings(settings),
  onUiSound: () => game?.audio.uiClick(),
});

game = new Game({ canvas, hudCanvas, screens });
window.__SKYFORGE__ = game;

async function boot() {
  try {
    await game.init();
    if (params.get('aircraft')) screens.selectAircraft(params.get('aircraft'));
    if (params.get('paint')) screens.setPaint(params.get('paint'));
    const autostart = params.get('autostart');
    if (autostart === 'instant' || autostart === 'runway' || autostart === 'test') {
      await game.start(autostart, params.get('aircraft') || undefined);
    }
  } catch (error) {
    console.error('[SKYFORGE] boot failed', error);
    const loading = document.getElementById('loading');
    const text = document.getElementById('loading-text');
    loading?.classList.remove('hidden');
    if (text) {
      text.innerHTML = `启动失败 · ${String(error?.message || error)}<br>` +
        '<span style="opacity:.6">请使用本地 HTTP 服务访问本页（不要直接双击 index.html）</span>';
      text.style.color = '#ff8f7e';
    }
    const fill = document.getElementById('loading-fill');
    if (fill) {
      fill.style.width = '100%';
      fill.style.background = '#ff6b58';
    }
  }
}

boot();
