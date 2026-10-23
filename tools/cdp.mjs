/**
 * Minimal Chrome DevTools Protocol client used by the verification tools.
 *
 * Runs headless Chrome with SwiftShader (software WebGL) so the harness pages
 * render without a GPU, opens one target per shot, and reports page errors so a
 * broken harness cannot silently look "fine" in a screenshot.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

export const PORT = 9223;
export const BASE = `http://127.0.0.1:${PORT}`;

class Page {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description
        || result.exceptionDetails.text);
    }
    return result.result.value;
  }

  async waitReady(timeoutMs = 90000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      try {
        if (await this.evaluate('window.__READY__ === true')) return true;
      } catch { /* navigating */ }
      await sleep(250);
    }
    return false;
  }

  get problems() {
    return this.events
      .filter((e) => e.method === 'Runtime.exceptionThrown'
        || (e.method === 'Log.entryAdded' && e.params.entry.level === 'error'))
      .filter((e) => !/favicon/i.test(e.params.entry?.url || ''))
      .map((e) => e.params.exceptionDetails?.exception?.description
        || e.params.exceptionDetails?.text
        || e.params.entry?.text)
      .filter(Boolean);
  }
}

/**
 * Launch Chrome, run `fn(api)`, always shut Chrome down.
 * api.open(url) -> { page, info, screenshot, close }
 */
export async function withBrowser(fn, { width = 1280, height = 800 } = {}) {
  const chromePath = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!chromePath) throw new Error('no Chrome/Edge executable found');
  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${join(process.env.TEMP, 'skyforge-cdp-tools')}`,
    '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', '--disable-dev-shm-usage',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    `--window-size=${width},${height}`,
    'about:blank',
  ], { stdio: 'ignore' });

  try {
    for (let i = 0; i < 120; i++) {
      try {
        const res = await fetch(`${BASE}/json/version`);
        if (res.ok) break;
      } catch { /* not up yet */ }
      if (i === 119) throw new Error('chrome CDP did not come up');
      await sleep(150);
    }

    const api = {
      async open(url) {
        const target = await (await fetch(`${BASE}/json/new?about:blank`, {
          method: 'PUT',
        })).json();
        const ws = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
          ws.addEventListener('open', resolve, { once: true });
          ws.addEventListener('error', reject, { once: true });
        });
        const page = new Page(ws);
        await page.send('Page.enable');
        await page.send('Runtime.enable');
        await page.send('Log.enable');
        await page.send('Emulation.setDeviceMetricsOverride', {
          width, height, deviceScaleFactor: 1, mobile: false,
        });
        await page.send('Page.navigate', { url });
        return {
          page,
          ready: await page.waitReady(),
          async info() {
            const raw = await page.evaluate(
              'JSON.stringify(window.__GEAR_PREVIEW__ ?? null)');
            return raw ? JSON.parse(raw) : null;
          },
          async screenshot() {
            const shot = await page.send('Page.captureScreenshot',
              { format: 'png' });
            return Buffer.from(shot.data, 'base64');
          },
          async close() {
            ws.close();
            await fetch(`${BASE}/json/close/${target.id}`).catch(() => {});
          },
        };
      },
    };

    return await fn(api);
  } finally {
    chrome.kill();
  }
}
