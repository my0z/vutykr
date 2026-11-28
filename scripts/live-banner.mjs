// 30분마다 무료 사진(Pixabay)을 새로 가져와 합성하고 KV 에 올린다 (이미지 생성 AI 를 쓰지 않아 비용 0 · git 커밋도 배포도 없다)
// 필요: PIXABAY_API_KEY CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID 그리고 playwright
// 관련성: 검색어 낱말이 태그 앞쪽에 모두 있어야 쓰고 사람이 나오는 사진과 차단 목록의 사진은 뺀다
import { readFileSync, existsSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { SITES } from '../sites/index.js';
import { EN } from './product-en.mjs';
import { buildHtml, randomDesign, copyOf } from './banner-design.mjs';

const PEXELS = process.env.PEXELS_API_KEY || ''; // 있으면 Pexels 사진과 동영상도 쓴다 (사진 가운데 구석에 출처를 적는다)
const KEY = process.env.PIXABAY_API_KEY, TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCT = process.env.CLOUDFLARE_ACCOUNT_ID || '709dcc6af36c8ee7b6d3d99e7a9fe422', NS = process.env.KV_NAMESPACE_ID || '8bdd6ff58a6248e0b310bf0d2e5235c6';
if (!KEY || !TOKEN) { console.log('PIXABAY_API_KEY 또는 CLOUDFLARE_API_TOKEN 없음'); process.exit(1); }
const COUNT = Number(process.env.COUNT || 1), VIDEOS = Number(process.env.VIDEOS || 0), MAX_AGE_DAYS = Number(process.env.MAX_AGE_DAYS || 30); // 한 달 지난 실시간 배너는 지운다
const kvUrl = k => `https://api.cloudflare.com/client/v4/accounts/${ACCT}/storage/kv/namespaces/${NS}/values/${encodeURIComponent(k)}`;
const kvGet = async k => { const r = await fetch(kvUrl(k), { headers: { authorization: `Bearer ${TOKEN}` } }); return r.ok ? r.text() : null; };
const kvPut = async (k, body) => { const r = await fetch(kvUrl(k), { method: 'PUT', headers: { authorization: `Bearer ${TOKEN}` }, body }); if (!r.ok) throw new Error('KV 쓰기 ' + r.status); };
const kvDel = k => fetch(kvUrl(k), { method: 'DELETE', headers: { authorization: `Bearer ${TOKEN}` } });
const pick = a => a[Math.floor(Math.random() * a.length)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const kst = new Date(Date.now() + 9 * 3600e3), stamp = kst.toISOString().slice(2, 13).replace(/[-T]/g, ''); // yymmddhh
const LAYOUTS = ['split', 'full', 'light', 'slant', 'glass', 'circle', 'mirror', 'fullr']; // mirror 와 fullr 은 사진이 왼쪽이다 (id 끝에 LP 를 붙여 광고 표시를 오른쪽 아래로 옮긴다)
// 영어 상품 이름으로 영어 태그를 검색한다 (한국어 태그는 딸랑이=꽃 토너=토너먼트 같은 엉뚱한 뜻이 많다)
const GENERIC = new Set(['pack', 'folded', 'small', 'womens', 'women', 'bottle', 'tube', 'jar', 'set', 'box', 'bag', 'white', 'leather', 'gold', 'wool', 'cordless', 'power', 'portable', 'compact', 'with', 'baby', 'stick', 'sticks']);
const PEOPLE = /\b(girl|boy|woman|women|man|men|child|children|kid|kids|people|person|portrait|face|model|couple|family|mother|father|baby girl|toddler|newborn baby)\b/i;
const BAD = /\b(pill|pills|tablet|tablets|medicine|medicines|medication|drug|drugs|capsule|capsules|pharmacy|syringe|injection|whey|protein|bodybuilding|fitness|gym|workout|muscle|steroid)\b/i;
const NOCHESS = (text, q) => /\bchess|checkmate/i.test(text) && !/chess/i.test(q); // 보드게임 검색에 체스 사진이 섞이지 않게 한다
const words = q => q.toLowerCase().replace(/'s\b/g, 's').replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean);
const keyTokens = q => words(q).filter(t => (t.length >= 4 || ['dog', 'cat', 'pet', 'toy'].includes(t)) && !GENERIC.has(t)); // dog 와 cat 도 꼭 있어야 하는 낱말로 본다 (사람용 제품과 구분)

// 영상 전용 엄격 규칙: 상품과 상관없는 장면 낱말이 있으면 버린다 (상품 영어 이름에 그 낱말이 있으면 허용)
const OFF = /\b(wood|woodwork|woodworking|carpenter|carpentry|workshop|lumber|timber|sawdust|construction|factory|waterfall|forest|mountain|landscape|aerial|drone|city|cityscape|traffic|highway|bridge|sunset|sunrise|sky|clouds|beach|desert|rock|rocks|stone|stones|crowd|silhouette)\b/gi;
const offScene = (text, q) => { const qw = new Set(words(q)); return (String(text).toLowerCase().match(OFF) || []).some(w => !qw.has(w.toLowerCase().replace(/s$/, '')) && !qw.has(w.toLowerCase())); };
const nounOf = q => { const k = keyTokens(q); return k[k.length - 1]; }; // 상품 이름의 마지막 낱말이 보통 물건 이름이다
async function search(q) {
  const r = await fetch(`https://pixabay.com/api/?key=${KEY}&q=${encodeURIComponent(words(q).filter(t => !['a', 'an', 'the'].includes(t)).join(' '))}&lang=en&image_type=photo&orientation=horizontal&min_width=1600&safesearch=true&order=popular&per_page=40`);
  if (r.status === 429) throw new Error('Pixabay 요청 한도 (429)');
  if (!r.ok) throw new Error('Pixabay ' + r.status);
  return (await r.json()).hits || [];
}
// 상품을 가리키는 낱말이 모두 태그의 앞쪽 네 개 안에 낱말 그대로 있고 사람 태그가 없는 사진만 쓴다 (태그는 관련 깊은 순서다)
function relevant(hit, q, headN = 4) {
  const tags = String(hit.tags || '').toLowerCase().split(',').map(t => t.trim()).filter(Boolean);
  const all = tags.join(' ');
  if (BAD.test(all) || NOCHESS(all, q)) return false; // 알약과 약과 사람용 운동 보충제 사진은 뺀다
  if (PEOPLE.test(all.replace(new RegExp('\\b(' + words(q).join('|') + ')\\b', 'g'), ''))) return false;
  const head = ', ' + tags.slice(0, headN).join(', ') + ', ';
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
    if (BAD.test(text) || NOCHESS(text, q) || /\b(art|artwork|painting|paintings|drawing|ancient|museum|antique|sculpture|engraving|illustration|print|etching|lithograph)\b/.test(text) || PEOPLE.test(text.replace(new RegExp('\\b(' + words(q).join('|') + ')\\b', 'g'), ''))) return false;
    return kt.length > 0 && kt.every(t => new RegExp('\\b' + t + 's?\\b').test(text));
  })());
  return hits;
}

// Pexels: 태그가 없어서 사진 설명(alt)이나 동영상 주소 낱말에 상품 낱말이 모두 있을 때만 쓴다. 출처는 사진 안 구석에 적는다 (API 약관)
const pexHeaders = () => ({ authorization: PEXELS, 'user-agent': 'banner-bot/1.0' });
function pexRelevant(text, q) {
  text = String(text || '').toLowerCase();
  if (BAD.test(text) || NOCHESS(text, q) || /\b(art|artwork|painting|drawing|illustration|3d|render|cartoon|anime|green screen|greenscreen|candle|birthday|party|halloween|christmas)\b/.test(text)) return false;
  if (PEOPLE.test(text.replace(new RegExp('\\b(' + words(q).join('|') + ')\\b', 'g'), ''))) return false;
  const kt = keyTokens(q);
  return kt.length > 0 && kt.every(t => new RegExp('\\b' + t + 's?\\b').test(text));
}
const pexStrict = (slug, q) => { const n = nounOf(q); return !offScene(slug, q) && !!n && new RegExp('\\b' + n + 's?\\b').test(slug.split(/\s+/).slice(0, 10).join(' ')); }; // 물건 낱말이 설명 앞쪽 열 낱말 안에 있어야 한다
async function findPexelsVideos(q) {
  const r = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(words(q).filter(t => !['a', 'an', 'the'].includes(t)).join(' '))}&per_page=40&orientation=landscape`, { headers: pexHeaders() });
  if (r.status === 429) throw new Error('Pexels 요청 한도 (429)');
  if (!r.ok) throw new Error('Pexels 동영상 ' + r.status);
  return ((await r.json()).videos || []).filter(v => !skip('pexelsv:' + v.id) && Number(v.duration) >= 4 && Number(v.duration) <= 60 && pexVideoUrl(v) && pexRelevant(String(v.url || '').replace(/^.*\/video\//, '').replace(/[-\/\d]+/g, ' '), q) && pexStrict(String(v.url || '').replace(/^.*\/video\//, '').replace(/[-\/\d]+/g, ' ').trim(), q));
}
function pexVideoUrl(v) { // 가로 1280 이상 중 가장 작은 mp4
  const c = (v.video_files || []).filter(f => f.file_type === 'video/mp4' && Number(f.width) >= 1280 && Number(f.width) <= 2560).sort((a, b) => a.width - b.width);
  return c.length ? c[0].link : null;
}

// 그림의 밝기와 대비와 윤곽 값을 구한다 (160x90 흑백으로 줄여서 계산)
function lookStats(fr) {
  if (!fr || fr.length !== 160 * 90) return null;
  let sum = 0, sq = 0, edge = 0;
  for (let i = 0; i < fr.length; i++) { sum += fr[i]; sq += fr[i] * fr[i]; if (i % 160) edge += Math.abs(fr[i] - fr[i - 1]); }
  const mean = sum / fr.length;
  return { mean, sd: Math.sqrt(sq / fr.length - mean * mean), ed: edge / fr.length };
}
// 어둡거나 밋밋하거나 흐리거나 흑백 노이즈처럼 너무 복잡한 그림은 쓰지 않는다
const badLook = st => st && (st.mean < 50 || st.sd < 22 || st.ed < 3 || st.ed > 30 || st.sd > 85 || (st.mean > 205 && st.sd < 40));
async function download(url) {
  const r = await fetch(url, { headers: { 'user-agent': 'banner-bot/1.0' }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error('사진 내려받기 ' + r.status);
  if (!/^image\/(jpe?g|png|webp)/.test(r.headers.get('content-type') || '')) throw new Error('이미지가 아님');
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 15e6) throw new Error('사진이 너무 큼');
  return buf;
}

// ---------- 움직이는 배너: Pixabay 동영상 (표기 의무 없음) 위에 글자 덮개를 얹어 짧은 mp4 로 만든다 ----------
const VLAYOUTS = ['full', 'fullr', 'glass']; // 동영상이 배너 전체 배경이 되는 배치만 쓴다
// 동영상은 이미지보다 태그가 느슨해서 영어 상품 이름의 낱말을 모두(짧은 낱말 포함) 앞쪽 세 태그 안에서 찾는다
function relevantVideo(hit, q, sid) {
  const tags = String(hit.tags || '').toLowerCase().split(',').map(t => t.trim()).filter(Boolean);
  if (PEOPLE.test(tags.join(' ').replace(new RegExp('\\b(' + words(q).join('|') + ')\\b', 'g'), '')) || BAD.test(tags.join(' ')) || NOCHESS(tags.join(' '), q)) return false;
  const head = ', ' + tags.slice(0, 3).join(', ') + ', ';
  if (sid === 'bebepong' && !/\b(baby|babies|infant|newborn|toddler)\b/.test(head)) return false; // 아기 사이트 영상은 baby 태그가 앞쪽에 있어야 한다
  const toks = words(q).filter(t => t.length >= 3 && !['the', 'with', 'and'].includes(t) && !GENERIC.has(t));
  if (offScene(tags.join(' '), q)) return false;
  const n = nounOf(q); if (n && !new RegExp('\\b' + n + 's?\\b').test(', ' + tags.slice(0, 3).join(', ') + ', ')) return false; // 물건 낱말이 앞쪽 세 태그 안에 있어야 한다
  return toks.length > 0 && toks.every(t => new RegExp('\\b' + t + 's?\\b').test(head));
}
async function searchVideos(q) {
  const r = await fetch(`https://pixabay.com/api/videos/?key=${KEY}&q=${encodeURIComponent(words(q).filter(t => !['a', 'an', 'the'].includes(t)).join(' '))}&lang=en&safesearch=true&per_page=30`);
  if (r.status === 429) throw new Error('Pixabay 요청 한도 (429)');
  if (!r.ok) throw new Error('Pixabay 동영상 ' + r.status);
  return ((await r.json()).hits || []).filter(h => Number(h.duration) >= 4 && Number(h.duration) <= 60);
}
function videoUrl(h) { // 가로 1280 이상 중에서 가장 작은 것 (1920 배너에 맞추되 내려받기는 가볍게)
  const v = h.videos || {}, c = ['small', 'medium', 'large'].map(k => v[k]).filter(x => x && x.url && Number(x.width) >= 1280 && Number(x.size) < 40e6);
  return c.length ? c[0].url : null;
}
async function overlayPng(browser, site, cat, narrow, design) {
  const w = narrow ? 960 : 1920, h = narrow ? 300 : 360;
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  await p.setContent(buildHtml(site, cat, '', narrow, { ...design, video: true }));
  const png = await p.screenshot({ type: 'png', omitBackground: true });
  await p.close();
  return png;
}
function composeVideo(dir, src, png, narrow, tag) {
  const w = narrow ? 960 : 1920, h = narrow ? 300 : 360, ov = join(dir, `ov-${tag}.png`), out = join(dir, `out-${tag}.mp4`), still = join(dir, `still-${tag}.webp`);
  writeFileSync(ov, png);
  const a = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-i', ov, '-t', '6', '-r', '24', '-filter_complex', `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}[v];[v][1:v]overlay=0:0:format=auto${narrow ? '' : ',scale=1440:270'},format=yuv420p`, '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '33', '-movflags', '+faststart', out], { encoding: 'utf8' });
  if (a.status !== 0) throw new Error('ffmpeg ' + String(a.stderr).slice(0, 200));
  const b = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '3', '-i', out, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '72', still], { encoding: 'utf8' });
  if (b.status !== 0) throw new Error('ffmpeg 정지 화면 ' + String(b.stderr).slice(0, 200));
  return { mp4: readFileSync(out), still: readFileSync(still) };
}

const json = async (k, d) => { try { return JSON.parse((await kvGet(k)) || 'null') ?? d; } catch (e) { return d; } };
let index = await json('live:index', []);
const block = new Set(await json('live:block', []));
const usedLive = new Set(await json('live:used', []));
const usedRepo = new Set((existsSync('sites/stock-used.json') ? JSON.parse(readFileSync('sites/stock-used.json', 'utf8')) : []).map(x => 'pixabay:' + x));
const skipDark = new Set();
const skip = src => skipDark.has(src) || block.has(src) || usedLive.has(src) || usedRepo.has(src);

const siteIds = Object.keys(SITES).filter(id => !SITES[id].draft); // 도메인 연결 전 사이트는 뺀다
// 배너가 적은 사이트와 분야부터 만든다 (전체 수 기준으로 모자란 곳을 돌아가며 채운다)
const catOf = x => { try { return decodeURIComponent(String(x.url || '').split('/c/')[1] || '').split('?')[0]; } catch (e) { return ''; } };
const cnt = { site: {}, cat: {} };
for (const x of index) { cnt.site[x.site] = (cnt.site[x.site] || 0) + 1; const k = x.site + '/' + catOf(x); cnt.cat[k] = (cnt.cat[k] || 0) + 1; }
const bump = (id, cat) => { cnt.site[id] = (cnt.site[id] || 0) + 1; const k = id + '/' + cat; cnt.cat[k] = (cnt.cat[k] || 0) + 1; };
const failed = { img: new Set(), vid: new Set() }; // 이번 실행에서 못 찾은 사이트는 다시 고르지 않는다 (한 사이트만 계속 골라 0개로 끝나는 것 방지)
const pickSite = (kind) => process.env.ONLY || siteIds.filter(x => !kind || !failed[kind].has(x) || siteIds.every(y => failed[kind].has(y))).sort((a, b) => ((cnt.site[a] || 0) - (cnt.site[b] || 0)) || (Math.random() - 0.5))[0];
const catsFor = (id, site) => Object.keys(site.cats).sort((a, b) => ((cnt.cat[id + '/' + a] || 0) - (cnt.cat[id + '/' + b] || 0)) || (Math.random() - 0.5));
const browser = await chromium.launch();
let made = 0; const fresh = [];
let imgTry = 0;
for (let k = 0; k < COUNT; k++) {
  const id = pickSite('img'), site = SITES[id];
  const cats = catsFor(id, site);
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
        const pst = lookStats(spawnSync('ffmpeg', ['-loglevel', 'error', '-i', 'pipe:0', '-frames:v', '1', '-vf', 'scale=160:90,format=gray', '-f', 'rawvideo', '-'], { input: photo, encoding: 'buffer' }).stdout);
        if (badLook(pst)) { console.log('사진 화질 기준 미달 건너뜀', src, 'mean', Math.round(pst.mean), 'sd', Math.round(pst.sd), 'edge', pst.ed.toFixed(1)); skipDark.add(src); continue; }
        const design = { ...randomDesign(pick(LAYOUTS)), px: '50%' };
        const dry = !!process.env.DRY; // DRY 는 목록에 올리지 않고 dry 로 시작하는 이름으로만 저장해 눈으로 확인한다
        let n = 0, bid; do { bid = `${dry ? 'dry' + id : id[0]}${stamp}${n ? n : ''}${['mirror', 'fullr'].includes(design.layout) ? 'L' : ''}P`; n++; } while (index.some(x => x.id === bid));
        const imgW = await shoot(browser, site, cat, photo, false, design), imgN = await shoot(browser, site, cat, photo, true, design);
        await kvPut(`live:img:${bid}-w`, imgW);
        await kvPut(`live:img:${bid}-n`, imgN);
        const item = { id: bid, site: id, text: copyOf(site, cat, design).title, url: `${site.host}/c/${encodeURIComponent(cat)}`, src, q, ts: Date.now(), bytes: imgW.length + imgN.length };
        if (!dry) { index.push(item); fresh.push(item); usedLive.add(src); made++; bump(id, cat); }
        ok = true;
        console.log(dry ? 'DRY' : '만듦', bid, srcName, cat, design.layout, '|', q, '|', String(tags).slice(0, 90));
      } catch (e) { console.log('실패', id, srcName, e.message); if (/429/.test(e.message)) break; }
    }
    if (ok) break;
  }
  if (!ok) { console.log('관련 사진을 못 찾음', id); failed.img.add(id); if (!process.env.ONLY && ++imgTry < siteIds.length) k--; } // 못 찾으면 다른 사이트로 다시 시도한다
}

let vidTry = 0;
for (let k = 0; k < VIDEOS; k++) { // 움직이는 배너
  const id = pickSite('vid'), site = SITES[id];
  const cats = catsFor(id, site);
  let ok = false;
  const dir = mkdtempSync(join(tmpdir(), 'vb-'));
  for (let t = 0; t < cats.length * 3 && !ok; t++) {
    const cat = cats[t % cats.length];
    const kws = (EN[id] && EN[id][cat]) || [];
    if (!kws.length) continue;
    const q = kws[Math.floor(t / cats.length) % kws.length];
    try {
      const usePex = Boolean(PEXELS) && Math.random() < 0.5; // 키가 있으면 절반은 Pexels 에서 찾는다
      const hits = usePex ? (await findPexelsVideos(q)).filter(v => id !== 'bebepong' || /\b(baby|babies|infant|newborn|toddler)\b/.test(String(v.url))) : ((await searchVideos(q)).filter(h => !skip('pixabayv:' + h.id) && videoUrl(h) && relevantVideo(h, q, id) && !/\b(anime|illustration|painting|drawing|green screen|greenscreen|chroma|grinding|grinder|sparks|ai generated|animated|animation|cartoon|candle|candles|birthday|party|halloween|flame|fire|concept|abstract|3d|christmas|jesus|nativity|celebration|holiday)\b/i.test(String(h.tags))));
      await sleep(700);
      if (!hits.length) continue;
      const hit = pick(hits.slice(0, 6));
      const vurl = usePex ? pexVideoUrl(hit) : videoUrl(hit), vkey = (usePex ? 'pexelsv:' : 'pixabayv:') + hit.id;
      const src = join(dir, 'src.mp4');
      const vr = await fetch(vurl, { signal: AbortSignal.timeout(60000) });
      if (!vr.ok) throw new Error('동영상 내려받기 ' + vr.status);
      writeFileSync(src, Buffer.from(await vr.arrayBuffer()));
      const st = lookStats(spawnSync('ffmpeg', ['-loglevel', 'error', '-ss', '3', '-i', src, '-frames:v', '1', '-vf', 'scale=160:90,format=gray', '-f', 'rawvideo', '-'], { encoding: 'buffer' }).stdout);
      if (badLook(st)) { console.log('화질 기준 미달 건너뜀', hit.id, 'mean', Math.round(st.mean), 'sd', Math.round(st.sd), 'edge', st.ed.toFixed(1)); skipDark.add(vkey); continue; } // 정지 화면이 어둡거나 밋밋하거나 흐리거나 노이즈 같으면 쓰지 않는다
      const design = { ...randomDesign(pick(VLAYOUTS)), px: '50%' };
      const left = design.layout === 'fullr';
      const dry = !!process.env.DRY;
      let n = 0, bid; do { bid = `${dry ? 'dry' + id : id[0]}${stamp}VT${n ? n : ''}${left ? 'L' : ''}P`; n++; } while (index.some(x => x.id === bid));
      const W = composeVideo(dir, src, await overlayPng(browser, site, cat, false, design), false, 'w');
      const N = composeVideo(dir, src, await overlayPng(browser, site, cat, true, design), true, 'n');
      await kvPut(`live:vid:${bid}-w`, W.mp4); await kvPut(`live:vid:${bid}-n`, N.mp4);
      await kvPut(`live:img:${bid}-w`, W.still); await kvPut(`live:img:${bid}-n`, N.still);
      const item = { id: bid, site: id, text: copyOf(site, cat, design).title, url: `${site.host}/c/${encodeURIComponent(cat)}`, src: vkey, q, ts: Date.now(), video: true, ...(usePex ? { pex: true } : {}), bytes: W.mp4.length + N.mp4.length + W.still.length + N.still.length };
      if (!dry) { index.push(item); fresh.push(item); usedLive.add(item.src); made++; bump(id, cat); }
      ok = true;
      console.log(dry ? 'DRY 영상' : '만듦 영상', bid, cat, design.layout, '|', q, '|', String(hit.tags).slice(0, 80), '|', Math.round(item.bytes / 1024) + 'KB');
    } catch (e) { console.log('실패 영상', id, e.message); if (/429/.test(e.message)) break; }
  }
  rmSync(dir, { recursive: true, force: true });
  if (!ok) { console.log('관련 동영상을 못 찾음', id); failed.vid.add(id); if (!process.env.ONLY && ++vidTry < siteIds.length * 2) k--; } // 못 찾으면 다른 사이트로 다시 시도한다 (성공할 때까지 사이트 수의 두 배까지)
}
// 예전 높이(240)로 만든 영상 배너를 같은 영상으로 새 높이(360)로 다시 만든다 (REBUILD=한 번에 만들 개수)
const removeIds = new Set();
if (Number(process.env.REBUILD || 0) > 0 && !process.env.DRY) {
  const dir = mkdtempSync(join(tmpdir(), 'rb-'));
  const olds = index.filter(x => x.video && !/VT/.test(x.id) && /^pixabayv:\d+$/.test(x.src || '')).slice(0, Number(process.env.REBUILD));
  for (const old of olds) {
    try {
      const r = await fetch(`https://pixabay.com/api/videos/?key=${KEY}&id=${old.src.split(':')[1]}`);
      const hit = r.ok ? ((await r.json()).hits || [])[0] : null;
      await sleep(700);
      if (!hit || !videoUrl(hit)) { console.log('원본 영상 없음 건너뜀', old.id); continue; }
      const site = SITES[old.site], cat = decodeURIComponent(old.url.split('/c/')[1] || '');
      if (!site || !site.cats[cat]) { console.log('카테고리 없음 건너뜀', old.id); continue; }
      const vr = await fetch(videoUrl(hit), { signal: AbortSignal.timeout(60000) });
      if (!vr.ok) throw new Error('동영상 내려받기 ' + vr.status);
      const src = join(dir, 'src.mp4'); writeFileSync(src, Buffer.from(await vr.arrayBuffer()));
      const design = { ...randomDesign(pick(VLAYOUTS)), px: '50%' }, left = design.layout === 'fullr';
      let n = 0, bid; do { bid = `${old.site[0]}${stamp}VT${n ? n : ''}${left ? 'L' : ''}P`; n++; } while (index.some(x => x.id === bid) || fresh.some(x => x.id === bid));
      const W = composeVideo(dir, src, await overlayPng(browser, site, cat, false, design), false, 'w');
      const N = composeVideo(dir, src, await overlayPng(browser, site, cat, true, design), true, 'n');
      await kvPut(`live:vid:${bid}-w`, W.mp4); await kvPut(`live:vid:${bid}-n`, N.mp4);
      await kvPut(`live:img:${bid}-w`, W.still); await kvPut(`live:img:${bid}-n`, N.still);
      fresh.push({ ...old, id: bid, text: copyOf(site, cat, design).title, bytes: W.mp4.length + N.mp4.length + W.still.length + N.still.length });
      removeIds.add(old.id); made++;
      for (const k of ['vid', 'img']) for (const v of ['w', 'n']) await kvDel(`live:${k}:${old.id}-${v}`);
      console.log('다시 만듦', old.id, '->', bid);
    } catch (e) { console.log('다시 만들기 실패', old.id, e.message); if (/429/.test(e.message)) break; }
  }
  rmSync(dir, { recursive: true, force: true });
}
await browser.close();
if (made || !process.env.DRY) {
  // 그사이 관리자가 지운 배너가 되살아나지 않게 최신 목록을 다시 읽어 새로 만든 것만 더한다
  let merged = [...(await json('live:index', [])).filter(x => !removeIds.has(x.id)), ...fresh].sort((a, b) => a.ts - b.ts);
  const cutoff = Date.now() - MAX_AGE_DAYS * 864e5, expired = merged.filter(x => x.ts < cutoff); // 한 달 지난 배너는 바로 지운다
  for (const x of expired) { await kvDel(`live:img:${x.id}-w`); await kvDel(`live:img:${x.id}-n`); if (x.video) { await kvDel(`live:vid:${x.id}-w`); await kvDel(`live:vid:${x.id}-n`); } console.log('한 달 지난 배너 삭제', x.id); }
  merged = merged.filter(x => x.ts >= cutoff);
  // KV 저장 한도(기본 1GB)에 가까워지면 가장 오래된 배너부터 차례로 지워 한도 아래로 되돌린다
  const LIMIT = Number(process.env.KV_LIMIT_MB || 800) * 1e6, TARGET = LIMIT * 0.875, size = x => x.bytes || 80000;
  let total = merged.reduce((a, x) => a + size(x), 0);
  if (total > LIMIT) {
    while (total > TARGET && merged.length > 1) { const old = merged.shift(); total -= size(old); await kvDel(`live:img:${old.id}-w`); await kvDel(`live:img:${old.id}-n`); if (old.video) { await kvDel(`live:vid:${old.id}-w`); await kvDel(`live:vid:${old.id}-n`); } console.log('오래된 배너 정리', old.id); }
  }
  await kvPut('live:index', JSON.stringify(merged));
  await kvPut('live:used', JSON.stringify([...usedLive].slice(-4000)));
}
console.log('만든 실시간 배너', made);
if (!made && !process.env.DRY) console.log('::warning::이번 실행에서 맞는 사진과 영상을 못 찾아 배너를 만들지 못했다 (다음 실행에서 다시 찾는다)'); // 관련성 기준이 엄격해 가끔 0개가 나와도 실패로 보지 않는다
