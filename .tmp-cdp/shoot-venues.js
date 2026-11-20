// Capture the homepage venue section (desktop + mobile) and measure the
// photo geometry inside the decorative frames.
const fs = require('fs');
const path = require('path');

const PORT = process.env.CDP_PORT || 9223;
const OUT = process.env.OUT_DIR || 'd:/PhiLuWedding/.tmp-shots';
const URL = process.env.PAGE_URL || 'http://127.0.0.1:5199/';

async function httpJson(url) {
  const res = await fetch(url);
  return res.json();
}

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
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
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
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('timeout ' + method));
        }
      }, 60000);
    });
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

const MEASURE = `(() => {
  const out = [];
  for (const card of document.querySelectorAll('.venues__grid .venue-card')) {
    const media = card.querySelector('.venue-card__media');
    const img = card.querySelector('.venue-card__media > img');
    if (!media || !img) continue;
    const m = media.getBoundingClientRect();
    const i = img.getBoundingClientRect();
    const cs = getComputedStyle(media);
    const is = getComputedStyle(img);
    const before = getComputedStyle(media, '::before');
    out.push({
      title: (card.querySelector('.venue-card__title') || {}).textContent.trim(),
      media: { w: +m.width.toFixed(2), h: +m.height.toFixed(2), top: +m.top.toFixed(2), left: +m.left.toFixed(2) },
      img: { w: +i.width.toFixed(2), h: +i.height.toFixed(2), top: +i.top.toFixed(2), left: +i.left.toFixed(2),
             natural: img.naturalWidth + 'x' + img.naturalHeight, complete: img.complete,
             objectFit: is.objectFit, objectPosition: is.objectPosition, heightCss: is.height, widthCss: is.width },
      gapTop: +(i.top - m.top).toFixed(2),
      gapBottom: +(m.bottom - i.bottom).toFixed(2),
      gapLeft: +(i.left - m.left).toFixed(2),
      gapRight: +(m.right - i.right).toFixed(2),
      mediaPad: cs.padding, mediaRatio: cs.aspectRatio, frameInset: before.top + '/' + before.left,
      natRatio: img.naturalWidth ? +(img.naturalWidth / img.naturalHeight).toFixed(3) : null,
      boxRatio: +(i.width / i.height).toFixed(3),
    });
  }
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

  const viewports = [
    { name: 'desktop', width: 1440, height: 900, mobile: false },
    { name: 'mobile', width: 390, height: 844, mobile: true },
  ];
  const results = {};

  for (const vp of viewports) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile,
    });
    await cdp.send('Page.navigate', { url: URL });
    await sleep(3000);
    // Scroll the venue section into view so lazy images load, then measure.
    await cdp.send('Runtime.evaluate', {
      expression: `document.querySelector('.venues').scrollIntoView({block:'center'}); 'ok'`,
      returnByValue: true,
    });
    await sleep(3000);
    const r = await cdp.send('Runtime.evaluate', { expression: MEASURE, returnByValue: true });
    results[vp.name] = r.result.value;

    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, `venues-${vp.name}.png`), Buffer.from(shot.data, 'base64'));
  }

  console.log(JSON.stringify(results, null, 1));
  ws.close();
  process.exit(0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
