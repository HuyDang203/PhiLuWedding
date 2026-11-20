// Verify the venue card photo alignment: inner spacing, centering,
// matched display box, and how much of each source photo is cropped.
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

const CHECK = `(() => {
  const rows = [];
  for (const card of document.querySelectorAll('.venue-card')) {
    const media = card.querySelector('.venue-card__media');
    const img = card.querySelector('.venue-card__media > img');
    if (!media || !img) continue;
    const m = media.getBoundingClientRect();
    const i = img.getBoundingClientRect();
    const cs = getComputedStyle(media);
    const before = getComputedStyle(media, '::before');
    const pad = parseFloat(cs.paddingTop);
    const bdr = parseFloat(cs.borderTopWidth);

    // object-fit: cover source-rect maths for the loaded image.
    const nw = img.naturalWidth, nh = img.naturalHeight;
    const scale = Math.max(i.width / nw, i.height / nh);
    const sw = i.width / scale, sh = i.height / scale;
    const sx = (nw - sw) / 2, sy = (nh - sh) / 2;

    // Inner gold frame edges (the ::before pseudo element).
    const fTop = m.top + bdr + parseFloat(before.top);
    const fLeft = m.left + bdr + parseFloat(before.left);
    const fBottom = m.top + bdr + cs.height - parseFloat(before.bottom);
    const fRight = m.left + bdr + cs.width - parseFloat(before.right);

    rows.push({
      title: (card.querySelector('.venue-card__title') || {}).textContent.trim(),
      imgBox: i.width + 'x' + i.height,
      natural: nw + 'x' + nh,
      boxRatio: +(i.width / i.height).toFixed(4),
      spacing: {
        top: +(i.top - m.top).toFixed(2),
        bottom: +(m.bottom - i.bottom).toFixed(2),
        left: +(i.left - m.left).toFixed(2),
        right: +(m.right - i.right).toFixed(2),
      },
      frameGap: {
        top: +(i.top - fTop).toFixed(2),
        bottom: +(fBottom - i.bottom).toFixed(2),
        left: +(i.left - fLeft).toFixed(2),
        right: +(fRight - i.right).toFixed(2),
      },
      crop: {
        pctWidth: +((1 - sw / nw) * 100).toFixed(2),
        pctHeight: +((1 - sh / nh) * 100).toFixed(2),
        visibleSource: sw.toFixed(0) + 'x' + sh.toFixed(0) + ' of ' + nw + 'x' + nh,
      },
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    });
  }
  const de = document.documentElement;
  const wide = [...document.querySelectorAll('.venues__grid *')]
    .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > de.clientWidth + 1 || r.left < -1); })
    .map(el => el.tagName + '.' + el.className);
  return { rows, scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, overflowing: wide };
})()`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const wsUrl = await connect();
  const ws = new WebSocket(wsUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  const cdp = new CDP(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  const pages = [
    { name: 'home', url: 'http://127.0.0.1:5199/', vp: [
      { name: 'desktop', width: 1440, height: 900, mobile: false },
      { name: 'mobile', width: 390, height: 844, mobile: true },
      { name: 'tablet', width: 768, height: 1024, mobile: true },
    ]},
    { name: 'venues-page', url: 'http://127.0.0.1:5199/tiec-cuoi', vp: [
      { name: 'desktop', width: 1440, height: 900, mobile: false },
      { name: 'mobile', width: 390, height: 844, mobile: true },
    ]},
  ];

  const results = {};
  for (const p of pages) {
    for (const vp of p.vp) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile,
      });
      await cdp.send('Page.navigate', { url: p.url });
      await sleep(2500);
      await cdp.send('Runtime.evaluate', {
        expression: `document.querySelector('.venues__grid, .venues-page__grid').scrollIntoView({block:'center'}); 'ok'`,
        returnByValue: true,
      });
      await sleep(2500);
      const r = await cdp.send('Runtime.evaluate', { expression: CHECK, returnByValue: true });
      results[p.name + '/' + vp.name] = r.result.value;
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, `venues-${p.name}-${vp.name}.png`), Buffer.from(shot.data, 'base64'));
    }
  }
  console.log(JSON.stringify(results, null, 1));
  ws.close();
  process.exit(0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
