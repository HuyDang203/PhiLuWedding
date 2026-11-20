// Pixel-level check: decode the captured PNG and verify that the photo
// really is centred inside the gold frame on the rendered page.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

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

function decodePng(buf) {
  let pos = 8, w = 0, h = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.slice(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (bitDepth !== 8) throw new Error('unsupported bit depth ' + bitDepth);
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * channels;
  const out = Buffer.alloc(h * stride);
  let rp = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[rp++];
    const line = raw.slice(rp, rp + stride); rp += stride;
    const cur = out.slice(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.slice((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[x] = v & 0xff;
    }
  }
  return { w, h, channels, data: out };
}

const CREAM = [0xF1, 0xE2, 0xB6];
const GOLD = [0xCD, 0xBA, 0x9B];
const near = (px, ref, tol) => Math.abs(px[0] - ref[0]) <= tol && Math.abs(px[1] - ref[1]) <= tol && Math.abs(px[2] - ref[2]) <= tol;

(async () => {
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
  const report = {};

  for (const vp of viewports) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile,
    });
    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:5199/' });
    await sleep(2500);
    await cdp.send('Runtime.evaluate', {
      expression: `document.querySelector('.venues__grid').scrollIntoView({block:'center'}); 'ok'`, returnByValue: true,
    });
    await sleep(2500);
    const geom = await cdp.send('Runtime.evaluate', {
      expression: `(() => [...document.querySelectorAll('.venue-card__media')].map(m => {
        const r = m.getBoundingClientRect();
        return { title: m.closest('.venue-card').querySelector('.venue-card__title').textContent.trim(),
                 x: r.left, y: r.top, w: r.width, h: r.height };
      }))()`, returnByValue: true,
    });
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const png = decodePng(Buffer.from(shot.data, 'base64'));
    fs.writeFileSync(path.join(OUT, `pixel-${vp.name}.png`), Buffer.from(shot.data, 'base64'));

    const px = (x, y) => {
      const i = (y * png.w + x) * png.channels;
      return [png.data[i], png.data[i + 1], png.data[i + 2]];
    };
    const classify = (x, y) => {
      const p = px(x, y);
      if (near(p, GOLD, 26)) return 'gold';
      if (near(p, CREAM, 12)) return 'cream';
      return 'photo';
    };

    const cards = [];
    for (const g of geom.result.value) {
      const cy = Math.round(g.y + g.h / 2);
      const cx = Math.round(g.x + g.w / 2);
      // Horizontal scan through the middle of the card.
      const row = [];
      for (let x = Math.round(g.x); x < Math.round(g.x + g.w); x++) row.push(classify(x, cy));
      // Find the photo run (longest consecutive 'photo' run).
      const runs = [];
      let s = 0;
      for (let i = 1; i <= row.length; i++) {
        if (i === row.length || row[i] !== row[s]) { runs.push({ kind: row[s], from: s, to: i - 1 }); s = i; }
      }
      const photoRun = runs.filter(r => r.kind === 'photo').sort((a, b) => (b.to - b.from) - (a.to - a.from))[0];
      const goldRuns = runs.filter(r => r.kind === 'gold');
      // Vertical scan through the middle of the card.
      const col = [];
      for (let y = Math.round(g.y); y < Math.round(g.y + g.h); y++) col.push(classify(cx, y));
      const cruns = [];
      let s2 = 0;
      for (let i = 1; i <= col.length; i++) {
        if (i === col.length || col[i] !== col[s2]) { cruns.push({ kind: col[s2], from: s2, to: i - 1 }); s2 = i; }
      }
      const photoCol = cruns.filter(r => r.kind === 'photo').sort((a, b) => (b.to - b.from) - (a.to - a.from))[0];

      const mediaLeft = Math.round(g.x);
      cards.push({
        title: g.title,
        media: `${g.w}x${g.h}`,
        photoSpanX: photoRun ? [photoRun.from, photoRun.to] : null,
        photoLeftGap: photoRun ? photoRun.from : null,
        photoRightGap: photoRun ? (Math.round(g.w) - 1 - photoRun.to) : null,
        goldFrameEdges: goldRuns.map(r => r.from),
        photoSpanY: photoCol ? [photoCol.from, photoCol.to] : null,
        photoTopGap: photoCol ? photoCol.from : null,
        photoBottomGap: photoCol ? (Math.round(g.h) - 1 - photoCol.to) : null,
      });
    }
    report[vp.name] = cards;
  }

  console.log(JSON.stringify(report, null, 1));
  ws.close();
  process.exit(0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
