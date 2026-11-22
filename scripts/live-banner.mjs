// 30분마다 무료 사진(Pixabay)을 새로 가져와 합성하고 KV 에 올린다 (이미지 생성 AI 를 쓰지 않아 비용 0 · git 커밋도 배포도 없다)
// 필요: PIXABAY_API_KEY CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID 그리고 playwright
// 관련성: 검색어 낱말이 태그 앞쪽에 모두 있어야 쓰고 사람이 나오는 사진과 차단 목록의 사진은 뺀다
import { readFileSync, existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { SITES } from '../sites/index.js';
import { EN } from './product-en.mjs';
import { buildHtml, randomDesign, copyOf } from './banner-design.mjs';

const KEY = process.env.PIXABAY_API_KEY, TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCT = process.env.CLOUDFLARE_ACCOUNT_ID || '709dcc6af36c8ee7b6d3d99e7a9fe422', NS = process.env.KV_NAMESPACE_ID || '8bdd6ff58a6248e0b310bf0d2e5235c6';
if (!KEY || !TOKEN) { console.log('PIXABAY_API_KEY 또는 CLOUDFLARE_API_TOKEN 없음'); process.exit(1); }
const COUNT = Number(process.env.COUNT || 1);
const kvUrl = k => `https://api.cloudflare.com/client/v4/accounts/${ACCT}/storage/kv/namespaces/${NS}/values/${encodeURIComponent(k)}`;
const kvGet = async k => { const r = await fetch(kvUrl(k), { headers: { authorization: `Bearer ${TOKEN}` } }); return r.ok ? r.text() : null; };
const kvPut = async (k, body) => { const r = await fetch(kvUrl(k), { method: 'PUT', headers: { authorization: `Bearer ${TOKEN}` }, body }); if (!r.ok) throw new Error('KV 쓰기 ' + r.status); };
const kvDel = k => fetch(kvUrl(k), { method: 'DELETE', headers: { authorization: `Bearer ${TOKEN}` } });
const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => [...a].sort(() => Math.random() - 0.5);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const kst = new Date(Date.now() + 9 * 3600e3), stamp = kst.toISOString().slice(2, 13).replace(/[-T]/g, ''); // yymmddhh
const LAYOUTS = ['split', 'full', 'light', 'slant', 'glass', 'circle']; // 사진 위치를 알 수 없으므로 사진이 왼쪽인 배치는 뺀다
// 영어 상품 이름으로 영어 태그를 검색한다 (한국어 태그는 딸랑이=꽃 토너=토너먼트 같은 엉뚱한 뜻이 많다)
const GENERIC = new Set(['pack', 'folded', 'small', 'womens', 'women', 'bottle', 'tube', 'jar', 'set', 'box', 'bag', 'white', 'leather', 'gold', 'wool', 'cordless', 'power', 'portable', 'compact', 'with', 'baby']);
const PEOPLE = /\b(girl|boy|woman|women|man|men|child|children|kid|kids|people|person|portrait|face|model|couple|family|mother|father|baby girl|toddler|newborn baby)\b/i;
const words = q => q.toLowerCase().replace(/'s\b/g, 's').replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean);
const keyTokens = q => words(q).filter(t => t.length >= 4 && !GENERIC.has(t));

async function search(q) {
  const r = await fetch(`https://pixabay.com/api/?key=${KEY}&q=${encodeURIComponent(words(q).filter(t => !['a', 'an', 'the'].includes(t)).join(' '))}&lang=en&image_type=photo&orientation=horizontal&min_width=1600&safesearch=true&order=popular&per_page=40`);
  if (r.status === 429) throw new Error('Pixabay 요청 한도 (429)');
  if (!r.ok) throw new Error('Pixabay ' + r.status);
  return (await r.json()).hits || [];
}
// 상품을 가리키는 낱말이 모두 태그의 앞쪽 네 개 안에 낱말 그대로 있고 사람 태그가 없는 사진만 쓴다 (태그는 관련 깊은 순서다)
function relevant(hit, q) {
  const tags = String(hit.tags || '').toLowerCase().split(',').map(t => t.trim()).filter(Boolean);
  const all = tags.join(' ');
  if (PEOPLE.test(all.replace(new RegExp('\\b(' + words(q).join('|') + ')\\b', 'g'), ''))) return false;
  const head = ', ' + tags.slice(0, 4).join(', ') + ', ';
  const kt = keyTokens(q);
  return kt.length > 0 && kt.every(t => new RegExp('\\b' + t + 's?\\b').test(head));
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

const json = async (k, d) => { try { return JSON.parse((await kvGet(k)) || 'null') ?? d; } catch (e) { return d; } };
let index = await json('live:index', []);
const block = new Set(await json('live:block', []));
const usedLive = new Set(await json('live:used', []));
const usedRepo = new Set((existsSync('sites/stock-used.json') ? JSON.parse(readFileSync('sites/stock-used.json', 'utf8')) : []).map(x => 'pixabay:' + x));
const skip = src => block.has(src) || usedLive.has(src) || usedRepo.has(src);

const siteIds = Object.keys(SITES);
const first = Number(process.env.START ?? Math.floor(Date.now() / 1800e3)) % siteIds.length; // 30분마다 사이트를 돌아가며 만든다
const browser = await chromium.launch();
let made = 0; const fresh = [];
for (let k = 0; k < COUNT; k++) {
  const id = process.env.ONLY || siteIds[(first + k) % siteIds.length], site = SITES[id];
  const cats = shuffle(Object.keys(site.cats));
  let ok = false;
  for (let t = 0; t < cats.length * 3 && !ok; t++) {
    const cat = cats[t % cats.length];
    const kws = (EN[id] && EN[id][cat]) || [];
    if (!kws.length) continue;
    const q = kws[Math.floor(t / cats.length) % kws.length];
    try {
      const hits = (await search(q)).filter(h => !skip('pixabay:' + h.id) && relevant(h, q));
      await sleep(700);
      if (!hits.length) continue;
      const hit = pick(hits.slice(0, 8));
      const pr = await fetch(hit.fullHDURL || hit.largeImageURL);
      if (!pr.ok) throw new Error('사진 내려받기 ' + pr.status);
      const photo = Buffer.from(await pr.arrayBuffer());
      const design = { ...randomDesign(pick(LAYOUTS)), px: '50%' };
      let n = 0, bid; do { bid = `${id[0]}${stamp}${n ? n : ''}P`; n++; } while (index.some(x => x.id === bid));
      await kvPut(`live:img:${bid}-w`, await shoot(browser, site, cat, photo, false, design));
      await kvPut(`live:img:${bid}-n`, await shoot(browser, site, cat, photo, true, design));
      const src = 'pixabay:' + hit.id;
      const item = { id: bid, site: id, text: copyOf(site, cat, design).title, url: `${site.host}/c/${encodeURIComponent(cat)}`, src, q, ts: Date.now() };
      index.push(item); fresh.push(item);
      usedLive.add(src); made++; ok = true;
      console.log('만듦', bid, cat, design.layout, '|', q, '|', String(hit.tags).slice(0, 60));
    } catch (e) { console.log('실패', id, e.message); if (/429/.test(e.message)) break; }
  }
  if (!ok) console.log('관련 사진을 못 찾음', id);
}
await browser.close();
if (made) {
  // 그사이 관리자가 지운 배너가 되살아나지 않게 최신 목록을 다시 읽어 새로 만든 것만 더한다
  const merged = [...(await json('live:index', [])), ...fresh]; // 오래된 배너도 지우지 않고 계속 쓴다
  await kvPut('live:index', JSON.stringify(merged.sort((a, b) => a.ts - b.ts)));
  await kvPut('live:used', JSON.stringify([...usedLive].slice(-4000)));
}
console.log('만든 실시간 배너', made);
if (!made) process.exit(1);
