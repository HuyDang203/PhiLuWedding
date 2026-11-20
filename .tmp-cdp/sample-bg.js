// Sample the homepage section background colours as rendered.
const fs = require('fs');
const path = require('path');

const PORT = process.env.CDP_PORT || 9223;
const OUT = process.env.OUT_DIR || 'd:/PhiLuWedding/.tmp-shots';

async function httpJson(url) { return (await fetch(url)).json(); }
async function connect() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await httpJson(`http://127.0.0.1:${PORT}/json/list`);
      const page = list.find(t => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('no CDP target');
}
class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map();
    ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('timeout ' + method)); } }, 60000);
    });
  }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

const SAMPLES = `(() => {
  const sels = ['.hero', '.intro', '.venues', '.booking', '.venue-card', '.venue-card__media', '.venue-card__body'];
  const out = {};
  for (const s of sels) {
    const el = document.querySelector(s);
    if (!el) { out[s] = null; continue; }
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    out[s] = { backgroundColor: cs.backgroundColor, backgroundImage: cs.backgroundImage,
               w: Math.round(r.width), h: Math.round(r.height) };
  }
  out.__tokens = (() => {
    const cs = getComputedStyle(document.documentElement);
    const names = ['--color-ivory','--color-cream','--color-paper','--color-card-cream','--color-border','--color-champagne'];
    const o = {};
    for (const n of names) o[n] = cs.getPropertyValue(n).trim();
    return o;
  })();
  return out;
})()`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const wsUrl = await connect();
  const ws = new WebSocket(wsUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  const cdp = new CDP(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.navigate', { url: 'http://127.0.0.1:5199/' });
  await sleep(3000);
  const r = await cdp.send('Runtime.evaluate', { expression: SAMPLES, returnByValue: true });
  console.log(JSON.stringify(r.result.value, null, 1));
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  fs.writeFileSync(path.join(OUT, 'homepage-full.png'), Buffer.from(shot.data, 'base64'));
  ws.close();
  process.exit(0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
