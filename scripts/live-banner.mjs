// 매시간 무료 사진(Pixabay)을 새로 가져와 합성하고 KV 에 올린다 (이미지 생성 AI 를 쓰지 않아 비용 0 · git 커밋도 배포도 없다)
// 필요: PIXABAY_API_KEY CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID 그리고 playwright
// 관련성: 검색어 낱말이 태그 앞쪽에 모두 있어야 쓰고 사람이 나오는 사진과 차단 목록의 사진은 뺀다
import { readFileSync, existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { SITES } from '../sites/index.js';
import { buildHtml, randomDesign, copyOf } from './banner-design.mjs';

const KEY = process.env.PIXABAY_API_KEY, TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCT = process.env.CLOUDFLARE_ACCOUNT_ID || '709dcc6af36c8ee7b6d3d99e7a9fe422', NS = process.env.KV_NAMESPACE_ID || '8bdd6ff58a6248e0b310bf0d2e5235c6';
if (!KEY || !TOKEN) { console.log('PIXABAY_API_KEY 또는 CLOUDFLARE_API_TOKEN 없음'); process.exit(1); }
const COUNT = Number(process.env.COUNT || 1), KEEP = 40; // 사이트마다 최근 40장만 둔다
const kvUrl = k => `https://api.cloudflare.com/client/v4/accounts/${ACCT}/storage/kv/namespaces/${NS}/values/${encodeURIComponent(k)}`;
const kvGet = async k => { const r = await fetch(kvUrl(k), { headers: { authorization: `Bearer ${TOKEN}` } }); return r.ok ? r.text() : null; };
const kvPut = async (k, body) => { const r = await fetch(kvUrl(k), { method: 'PUT', headers: { authorization: `Bearer ${TOKEN}` }, body }); if (!r.ok) throw new Error('KV 쓰기 ' + r.status); };
const kvDel = k => fetch(kvUrl(k), { method: 'DELETE', headers: { authorization: `Bearer ${TOKEN}` } });
const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => [...a].sort(() => Math.random() - 0.5);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const kst = new Date(Date.now() + 9 * 3600e3), stamp = kst.toISOString().slice(2, 13).replace(/[-T]/g, ''); // yymmddhh
const LAYOUTS = ['split', 'full', 'light', 'slant', 'glass', 'circle']; // 사진 위치를 알 수 없으므로 사진이 왼쪽인 배치는 뺀다
const AMBIG = new Set(['쿠션', '어항', '팩', '배', '차', '밤', '눈', '물']);
const QMAP = { 관상어: ['열대어', '수족관', '금붕어'], 메이크업: ['화장품', '립스틱', '아이섀도'], 바디헤어: ['바디워시', '바디로션', '헤어 에센스'], 장신구: ['목걸이', '귀걸이', '팔찌'] };
const PEOPLE = /사람|여성|여자|남성|남자|소녀|소년|아기|아이|어린이|유아|모델|얼굴|커플|가족|엄마|아빠|초상|신부|신랑|사진가|인물|girl|boy|woman|women|man|men|baby|child|kid|people|person|portrait|face|model|couple|family/i;

async function search(q) {
  const r = await fetch(`https://pixabay.com/api/?key=${KEY}&q=${encodeURIComponent(q)}&lang=ko&image_type=photo&orientation=horizontal&min_width=1600&safesearch=true&order=popular&per_page=40`);
  if (r.status === 429) throw new Error('Pixabay 요청 한도 (429)');
  if (!r.ok) throw new Error('Pixabay ' + r.status);
  return (await r.json()).hits || [];
}
// 검색어 낱말이 모두 태그의 앞쪽 네 개 안에 있고 사람 태그가 없는 사진만 쓴다 (태그는 관련 깊은 순서다)
function relevant(hit, q) {
  const tags = String(hit.tags || '').split(',').map(t => t.trim());
  if (PEOPLE.test(tags.join(' '))) return false;
  const head = tags.slice(0, 4).join('').replace(/\s/g, '');
  const toks = q.split(/\s+/).map(t => t.replace(/\s/g, '')).filter(t => t.length >= 2);
  return toks.length > 0 && toks.every(t => head.includes(t));
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
const first = Number(process.env.START ?? new Date().getUTCHours()) % siteIds.length; // 시간마다 사이트를 돌아가며 만든다
const browser = await chromium.launch();
let made = 0; const fresh = [];
for (let k = 0; k < COUNT; k++) {
  const id = process.env.ONLY || siteIds[(first + k) % siteIds.length], site = SITES[id];
  const cats = shuffle(Object.keys(site.cats));
  let ok = false;
  for (let t = 0; t < cats.length * 3 && !ok; t++) {
    const cat = cats[t % cats.length];
    const kws = (QMAP[cat] || site.cats[cat].kw).filter(x => !AMBIG.has(x));
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
  const merged = [...(await json('live:index', [])), ...fresh], keep = [], drop = [];
  for (const sid of siteIds) { const arr = merged.filter(x => x.site === sid).sort((a, b) => a.ts - b.ts); drop.push(...arr.slice(0, Math.max(0, arr.length - KEEP))); keep.push(...arr.slice(-KEEP)); } // 사이트마다 최근 KEEP 장만 둔다
  for (const x of drop) { await kvDel(`live:img:${x.id}-w`); await kvDel(`live:img:${x.id}-n`); }
  await kvPut('live:index', JSON.stringify(keep.sort((a, b) => a.ts - b.ts)));
  await kvPut('live:used', JSON.stringify([...usedLive].slice(-4000)));
}
console.log('만든 실시간 배너', made);
if (!made) process.exit(1);
