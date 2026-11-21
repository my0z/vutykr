// 매일 사이트마다 새 배너를 한두 개씩 만든다 (Cloudflare Workers AI 무료 한도 안에서)
// 필요: 환경변수 CLOUDFLARE_API_TOKEN 과 CLOUDFLARE_ACCOUNT_ID, 그리고 playwright (npm i --no-save playwright)
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { SITES } from '../sites/index.js';

const TOKEN = process.env.CLOUDFLARE_API_TOKEN, ACCT = process.env.CLOUDFLARE_ACCOUNT_ID || '709dcc6af36c8ee7b6d3d99e7a9fe422';
const MAX_PER_DAY = Number(process.env.BANNERS_MAX || 8); // 하루에 만드는 배너 수의 상한 (무료 한도 보호)
const KEEP_PER_SITE = 8; // 사이트마다 자동 배너는 최근 8개만 남긴다
const LIST = new URL('../sites/auto-promos.json', import.meta.url);
const OUT = new URL('../public/promo/', import.meta.url);
const ai = (model, init) => fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCT}/ai/run/${model}`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, ...(init.json ? { 'content-type': 'application/json' } : {}) }, body: init.json ? JSON.stringify(init.json) : init.form });
const pick = a => a[Math.floor(Math.random() * a.length)];
const yymmdd = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(2, 10).replace(/-/g, '');
const dark = (hex, k = 0.72) => '#' + hex.replace('#', '').match(/../g).map(h => Math.round(parseInt(h, 16) * k).toString(16).padStart(2, '0')).join('');

// 한 장면을 영어 문장으로 만든다 (사람은 육아 사이트에서만 쓰고 속옷은 상품만 보여 준다)
async function scene(site, cat) {
  const cfg = site.cats[cat];
  const people = site.id === 'bebepong' ? 'A baby may appear and must be fully clothed and wholesome.' : 'Do not include any people.';
  const r = await ai('@cf/meta/llama-3.1-8b-instruct', { json: { max_tokens: 90, messages: [
    { role: 'system', content: 'You write one short English sentence describing a realistic lifestyle photograph for a shopping banner. Output only the sentence. No text or logos in the picture.' },
    { role: 'user', content: `Site: ${site.tagline}. Category: ${cat}. Example items: ${cfg.kw.slice(0, 3).join(' ')}. Translate the Korean words into the matching real products and describe a bright attractive scene showing them. ${people} Never describe underwear being worn.` }
  ] } });
  const j = await r.json();
  const t = j.result && j.result.response;
  if (!t) throw new Error('장면 문장 실패 ' + JSON.stringify(j.errors || j).slice(0, 120));
  return t.replace(/\s+/g, ' ').trim();
}

async function image(text) {
  const f = new FormData(); f.append('prompt', `Photorealistic candid photo. ${text} Natural soft light shallow depth of field wide composition with the subject on the right side and empty space on the left.`); f.append('width', '1344'); f.append('height', '768');
  const r = await ai('@cf/black-forest-labs/flux-2-dev', { form: f });
  if ((r.headers.get('content-type') || '').startsWith('image/')) return Buffer.from(await r.arrayBuffer());
  const j = await r.json();
  if (!(j.result && j.result.image)) throw new Error('이미지 실패 ' + JSON.stringify(j.errors || j).slice(0, 160));
  return Buffer.from(j.result.image, 'base64');
}

function html(site, cat, photo, narrow) {
  const L = site.theme.light, w = narrow ? 960 : 1920, h = narrow ? 300 : 240, ww = narrow ? 420 : 460, sc = Math.max(ww / 1344, h / 768);
  const G = `linear-gradient(100deg,${dark(L.p1)} 0%,${L.p1} 55%,${L.p2} 100%)`, BTN = dark(L.p1, 0.8);
  const title = `${cat} 인기 랭킹`, sub = `${site.cats[cat].kw.slice(0, 3).join(' · ')} 베스트를 한눈에`;
  return `<html><body style="margin:0;width:${w}px;height:${h}px;overflow:hidden;font-family:'Noto Sans CJK KR','Noto Sans KR',sans-serif"><div style="position:relative;width:${w}px;height:${h}px;background:${G};color:#fff;overflow:hidden">
<div style="position:absolute;left:${narrow ? 300 : 650}px;top:${narrow ? -80 : -140}px;width:${narrow ? 440 : 540}px;height:${narrow ? 440 : 540}px;border-radius:50%;background:rgba(255,255,255,.1)"></div>
<div style="position:absolute;right:${narrow ? 0 : 20}px;top:0;width:${ww}px;height:${h}px;background:url(data:image/jpeg;base64,${photo.toString('base64')}) no-repeat;background-size:${Math.round(1344 * sc)}px ${Math.round(768 * sc)}px;background-position:${-Math.round((1344 * sc - ww) * 0.6)}px ${-Math.round((768 * sc - h) / 2)}px;-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 30%);mask-image:linear-gradient(90deg,transparent 0,#000 30%)"></div>
<div style="position:absolute;left:${narrow ? 48 : 90}px;top:${narrow ? 40 : 32}px"><div style="display:inline-block;background:rgba(255,255,255,.22);padding:6px 20px;border-radius:99px;font-weight:800;font-size:${narrow ? 20 : 22}px">${site.name}</div>
<div style="font-weight:900;font-size:${narrow ? 38 : 52}px;line-height:1.15;margin-top:${narrow ? 12 : 8}px;letter-spacing:-.03em;text-shadow:0 2px 12px rgba(0,0,0,.25);white-space:nowrap">${title}</div>
<div style="font-weight:500;font-size:${narrow ? 21 : 28}px;margin-top:${narrow ? 8 : 6}px;opacity:.96;white-space:nowrap">${sub}</div>
${narrow ? `<div style="display:inline-block;margin-top:16px;background:#fff;color:${BTN};font-weight:900;font-size:24px;padding:12px 34px;border-radius:99px">${site.name} 가기 →</div>` : ''}</div>
${narrow ? '' : `<div style="position:absolute;left:1000px;top:98px;background:#fff;color:${BTN};font-weight:900;font-size:32px;padding:20px 52px;border-radius:99px;white-space:nowrap">${site.name} 가기 →</div>`}</div></body></html>`;
}

async function shoot(browser, site, cat, photo, narrow) {
  const w = narrow ? 960 : 1920, h = narrow ? 300 : 240;
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  await p.setContent(html(site, cat, photo, narrow));
  const png = await p.screenshot({ type: 'png' });
  const webp = await p.evaluate(async b64 => { const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; c.getContext('2d').drawImage(im, 0, 0); return (await new Promise(r => c.toBlob(r, 'image/webp', 0.84)).then(b => b.arrayBuffer().then(x => btoa(String.fromCharCode(...new Uint8Array(x)))))); }, png.toString('base64'));
  await p.close();
  return Buffer.from(webp, 'base64');
}

const list = JSON.parse(readFileSync(LIST, 'utf8'));
const ids = Object.keys(SITES).sort(() => Math.random() - 0.5);
const extra = new Set(ids.filter(() => Math.random() < 0.33)); // 일부 사이트는 두 개
let plan = ids.flatMap(id => extra.has(id) ? [id, id] : [id]).slice(0, MAX_PER_DAY);
const browser = await chromium.launch();
let made = 0; const day = yymmdd(); const used = new Set(list.map(x => x.id));
for (const id of plan) {
  const site = SITES[id];
  try {
    const cat = pick(Object.keys(site.cats));
    const text = await scene(site, cat);
    const photo = await image(text);
    let n = 1, bid; do { bid = `${id[0]}${day}${n++}`; } while (used.has(bid));
    writeFileSync(new URL(`${bid}-w.webp`, OUT), await shoot(browser, site, cat, photo, false));
    writeFileSync(new URL(`${bid}-n.webp`, OUT), await shoot(browser, site, cat, photo, true));
    used.add(bid);
    list.push({ id: bid, site: id, text: `${cat} 인기 랭킹`, url: `${site.host}/c/${encodeURIComponent(cat)}` });
    made++; console.log('만듦', bid, cat, '|', text.slice(0, 80));
  } catch (e) { console.log('실패', id, e.message); if (/quota|limit|429|10000|capacity/i.test(e.message)) break; }
}
await browser.close();
// 오래된 자동 배너 정리
const bySite = {};
for (const b of list) (bySite[b.site] ||= []).push(b);
const keep = [];
for (const arr of Object.values(bySite)) { arr.sort((a, b) => a.id.localeCompare(b.id)); for (const old of arr.slice(0, Math.max(0, arr.length - KEEP_PER_SITE))) for (const s of ['w', 'n']) { const f = new URL(`${old.id}-${s}.webp`, OUT); if (existsSync(f)) rmSync(f); } keep.push(...arr.slice(-KEEP_PER_SITE)); }
writeFileSync(LIST, JSON.stringify(keep, null, 1) + '\n');
console.log('오늘 만든 배너', made);
if (!made) process.exit(1);
