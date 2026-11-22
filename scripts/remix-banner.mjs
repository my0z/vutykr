// 이미 눈으로 확인해 승인한 무료 사진(Pixabay)을 새 디자인으로 다시 합성한다 (이미지 생성 AI 를 쓰지 않아 비용 0 · 관련성은 이미 검증됨)
// 필요: PIXABAY_API_KEY 와 playwright. 환경변수 BANNERS_MAX (기본 6) 장을 사이트마다 돌아가며 만든다.
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { SITES } from '../sites/index.js';
import { buildHtml, randomDesign, copyOf } from './banner-design.mjs';

const KEY = process.env.PIXABAY_API_KEY;
if (!KEY) { console.log('PIXABAY_API_KEY 없음'); process.exit(1); }
const MAX = Number(process.env.BANNERS_MAX || 6), ONLY = process.env.ONLY;
const LIST = new URL('../sites/auto-promos.json', import.meta.url);
const OUT = new URL('../public/promo/', import.meta.url);
const pick = a => a[Math.floor(Math.random() * a.length)];
const day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(2, 10).replace(/-/g, '');
const LAYOUTS = ['split', 'full', 'light', 'slant', 'glass', 'circle', 'mirror', 'fullr']; // mirror 와 fullr 은 사진이 왼쪽이다 (id 끝에 LP 를 붙여 광고 표시를 오른쪽 아래로 옮긴다)

async function photoOf(pid) {
  const r = await fetch(`https://pixabay.com/api/?key=${KEY}&id=${pid}`);
  if (!r.ok) throw new Error('Pixabay ' + r.status);
  const h = ((await r.json()).hits || [])[0];
  if (!h) throw new Error('사진이 없어졌다 ' + pid);
  const p = await fetch(h.fullHDURL || h.largeImageURL);
  if (!p.ok) throw new Error('사진 내려받기 ' + p.status);
  return Buffer.from(await p.arrayBuffer());
}

async function shoot(browser, site, cat, photo, narrow, design) {
  const w = narrow ? 960 : 1920, h = narrow ? 300 : 240;
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  await p.setContent(buildHtml(site, cat, photo.toString('base64'), narrow, design));
  const png = await p.screenshot({ type: 'png' });
  const webp = await p.evaluate(async b64 => { const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; c.getContext('2d').drawImage(im, 0, 0); return c.toDataURL('image/webp', 0.82).split(',')[1]; }, png.toString('base64'));
  await p.close();
  return Buffer.from(webp, 'base64');
}

const list = JSON.parse(readFileSync(LIST, 'utf8'));
const used = new Set(list.map(x => x.id));
const uses = {}; for (const x of list) if (x.src) uses[x.src] = (uses[x.src] || 0) + 1;
const ids = Object.keys(SITES).sort(() => Math.random() - 0.5);
const plan = ONLY ? Array(MAX).fill(ONLY) : Array.from({ length: MAX }, (_, i) => ids[i % ids.length]);
const browser = await chromium.launch();
let made = 0;
for (const id of plan) {
  const site = SITES[id];
  try {
    const pool = list.filter(x => x.site === id && String(x.src || '').startsWith('pixabay:'));
    if (!pool.length) { console.log('쓸 사진 없음', id); continue; }
    const least = Math.min(...pool.map(x => uses[x.src]));
    const base = pick(pool.filter(x => uses[x.src] === least)); // 가장 덜 쓴 사진부터
    const cat = decodeURIComponent(base.url.split('/c/')[1] || '');
    if (!site.cats[cat]) { console.log('카테고리 없음', id, cat); continue; }
    const photo = await photoOf(base.src.split(':')[1]);
    const design = { ...randomDesign(pick(LAYOUTS)), px: '50%' };
    let n = 1, bid; do { bid = `${id[0]}${day}${n++}${['mirror', 'fullr'].includes(design.layout) ? 'L' : ''}P`; } while (used.has(bid));
    writeFileSync(new URL(`${bid}-w.webp`, OUT), await shoot(browser, site, cat, photo, false, design));
    writeFileSync(new URL(`${bid}-n.webp`, OUT), await shoot(browser, site, cat, photo, true, design));
    used.add(bid); uses[base.src]++;
    list.push({ id: bid, site: id, text: copyOf(site, cat, design).title, url: base.url, src: base.src, q: base.q });
    made++; console.log('만듦', bid, cat, design.layout, '|', base.q, base.src);
  } catch (e) { console.log('실패', id, e.message); if (/429/.test(e.message)) break; }
}
await browser.close();
writeFileSync(LIST, JSON.stringify(list, null, 1) + '\n');
console.log('만든 배너', made);
if (!made) process.exit(1);
