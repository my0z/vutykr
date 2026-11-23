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
const LAYOUTS = ['split', 'full', 'light', 'slant', 'glass', 'circle', 'mirror', 'fullr']; // mirror 와 fullr 은 사진이 왼쪽이다 (id 끝에 LP 를 붙여 광고 표시를 오른쪽 아래로 옮긴다)
// 영어 상품 이름으로 영어 태그를 검색한다 (한국어 태그는 딸랑이=꽃 토너=토너먼트 같은 엉뚱한 뜻이 많다)
const GENERIC = new Set(['pack', 'folded', 'small', 'womens', 'women', 'bottle', 'tube', 'jar', 'set', 'box', 'bag', 'white', 'leather', 'gold', 'wool', 'cordless', 'power', 'portable', 'compact', 'with', 'baby']);
const PEOPLE = /\b(girl|boy|woman|women|man|men|child|children|kid|kids|people|person|portrait|face|model|couple|family|mother|father|baby girl|toddler|newborn baby)\b/i;
const BAD = /\b(pill|pills|tablet|tablets|medicine|medicines|medication|drug|drugs|capsule|capsules|pharmacy|syringe|injection|whey|protein|bodybuilding|fitness|gym|workout|muscle|steroid)\b/i;
const words = q => q.toLowerCase().replace(/'s\b/g, 's').replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean);
const keyTokens = q => words(q).filter(t => (t.length >= 4 || ['dog', 'cat', 'pet'].includes(t)) && !GENERIC.has(t)); // dog 와 cat 도 꼭 있어야 하는 낱말로 본다 (사람용 제품과 구분)

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
  if (BAD.test(all)) return false; // 알약과 약과 사람용 운동 보충제 사진은 뺀다
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


// Openverse: 표기 의무가 없는 CC0 와 퍼블릭 도메인 사진만 가져온다 (Pixabay 에서 못 찾을 때 두 번째로 쓴다)
async function findOV(q) {
  const r = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(words(q).filter(t => !['a', 'an', 'the'].includes(t)).join(' '))}&license=cc0,pdm&category=photograph&size=large&mature=false&page_size=20`, { headers: { 'user-agent': 'banner-bot/1.0' } });
  if (r.status === 429) throw new Error('Openverse 요청 한도 (429)');
  if (!r.ok) throw new Error('Openverse ' + r.status);
  const kt = keyTokens(q);
  const hits = ((await r.json()).results || []).filter(h => !skip('openverse:' + h.id) && Number(h.width) >= 1600 && ['cc0', 'pdm'].includes(String(h.license).toLowerCase()) && (() => {
    const text = (String(h.title || '') + ', ' + (h.tags || []).map(t => t.name).join(', ')).toLowerCase();
    if (BAD.test(text) || PEOPLE.test(text.replace(new RegExp('\\b(' + words(q).join('|') + ')\\b', 'g'), ''))) return false;
    return kt.length > 0 && kt.every(t => new RegExp('\\b' + t + 's?\\b').test(text));
  })());
  return hits;
}
async function download(url) {
  const r = await fetch(url, { headers: { 'user-agent': 'banner-bot/1.0' }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error('사진 내려받기 ' + r.status);
  if (!/^image\/(jpe?g|png|webp)/.test(r.headers.get('content-type') || '')) throw new Error('이미지가 아님');
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 15e6) throw new Error('사진이 너무 큼');
  return buf;
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
  for (const srcName of (process.env.FORCE_OV ? ['ov'] : ['pixabay', 'ov'])) { // Pixabay 에서 못 찾으면 Openverse(CC0)를 쓴다
    for (let t = 0; t < cats.length * 3 && !ok; t++) {
      const cat = cats[t % cats.length];
      const kws = (EN[id] && EN[id][cat]) || [];
      if (!kws.length) continue;
      const q = kws[Math.floor(t / cats.length) % kws.length];
      try {
        let src, tags, photo;
        if (srcName === 'pixabay') {
          const hits = (await search(q)).filter(h => !skip('pixabay:' + h.id) && relevant(h, q));
          await sleep(700);
          if (!hits.length) continue;
          const hit = pick(hits.slice(0, 8));
          photo = await download(hit.fullHDURL || hit.largeImageURL); src = 'pixabay:' + hit.id; tags = hit.tags;
        } else {
          const hits = await findOV(q);
          await sleep(1500);
          if (!hits.length) continue;
          const hit = pick(hits.slice(0, 6));
          photo = await download(hit.url); src = 'openverse:' + hit.id; tags = (hit.title || '') + ' | ' + (hit.tags || []).map(x => x.name).join(', ');
        }
        const design = { ...randomDesign(pick(LAYOUTS)), px: '50%' };
        const dry = !!process.env.DRY; // DRY 는 목록에 올리지 않고 dry 로 시작하는 이름으로만 저장해 눈으로 확인한다
        let n = 0, bid; do { bid = `${dry ? 'dry' : id[0]}${stamp}${n ? n : ''}${['mirror', 'fullr'].includes(design.layout) ? 'L' : ''}P`; n++; } while (index.some(x => x.id === bid));
        const imgW = await shoot(browser, site, cat, photo, false, design), imgN = await shoot(browser, site, cat, photo, true, design);
        await kvPut(`live:img:${bid}-w`, imgW);
        await kvPut(`live:img:${bid}-n`, imgN);
        const item = { id: bid, site: id, text: copyOf(site, cat, design).title, url: `${site.host}/c/${encodeURIComponent(cat)}`, src, q, ts: Date.now(), bytes: imgW.length + imgN.length };
        if (!dry) { index.push(item); fresh.push(item); usedLive.add(src); made++; }
        ok = true;
        console.log(dry ? 'DRY' : '만듦', bid, srcName, cat, design.layout, '|', q, '|', String(tags).slice(0, 90));
      } catch (e) { console.log('실패', id, srcName, e.message); if (/429/.test(e.message)) break; }
    }
    if (ok) break;
  }
  if (!ok) console.log('관련 사진을 못 찾음', id);
}
await browser.close();
if (made) {
  // 그사이 관리자가 지운 배너가 되살아나지 않게 최신 목록을 다시 읽어 새로 만든 것만 더한다
  let merged = [...(await json('live:index', [])), ...fresh].sort((a, b) => a.ts - b.ts); // 평소엔 지우지 않고 계속 보관한다
  // KV 저장 한도(기본 1GB)에 가까워지면 가장 오래된 배너부터 차례로 지워 한도 아래로 되돌린다
  const LIMIT = Number(process.env.KV_LIMIT_MB || 800) * 1e6, TARGET = LIMIT * 0.875, size = x => x.bytes || 80000;
  let total = merged.reduce((a, x) => a + size(x), 0);
  if (total > LIMIT) {
    while (total > TARGET && merged.length > 1) { const old = merged.shift(); total -= size(old); await kvDel(`live:img:${old.id}-w`); await kvDel(`live:img:${old.id}-n`); console.log('오래된 배너 정리', old.id); }
  }
  await kvPut('live:index', JSON.stringify(merged));
  await kvPut('live:used', JSON.stringify([...usedLive].slice(-4000)));
}
console.log('만든 실시간 배너', made);
if (!made && !process.env.DRY) process.exit(1);
