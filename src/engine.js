// 사이트 하나가 하는 일 전부 (상품 갱신과 짧은 링크와 이미지와 요청 처리) — 사이트마다 설정만 다르고 코드는 이 하나를 같이 쓴다
import { goPage } from './go.js';
import { pingIndexNow } from './indexnow.js';
const HOST = 'https://api-gateway.coupang.com';
const BASE = '/v2/providers/affiliate_open_api/apis/openapi/v1/products';


// 쿠팡 파트너스 운영정책상 홍보하면 안 되는 상품(이미테이션과 성인용품)을 모든 사이트에서 거른다. 사이트마다 더 거를 것은 설정의 block과 reject에 둔다
const BASE_BLOCK = '이미테이션|짝퉁|레플리카|replica|모조품|카피|정품급|[SA]급|성인용품|19금|콘돔|딜도|바이브|자위|애널|러브젤|진동기|오나홀|섹스|최음|리얼돌|흥분';
const PER_RUN = 7; // 한 번에 가장 오래된 검색어 7개만 갱신 (세 사이트가 같은 쿠팡 키를 나눠 쓰고 시간당 10회 제한이 있다)
const BEST_TTL = 6 * 3600e3; // 베스트 목록은 6시간마다 다시 부른다
const PER_KEYWORD = 6;
const SCAN = /(^|\/)(\.env|\.git|\.aws|\.ssh|\.svn|\.ds_store|\.htaccess|wp-|wordpress|xmlrpc|phpmyadmin|phpinfo|cgi-bin|vendor\/|node_modules|backup|dump|config\.(json|js|yml|yaml|php|bak))|\.(php\d?|asp|aspx|jsp|cgi|sql|bak|zip|tar|gz|rar|7z|old|swp|pem|key)$/i;

const ALPHA = '0123456789abcdefghijklmnopqrstuvwxyz';
function codeFor(id, salt) {
  let h = 2166136261 >>> 0;
  const s = id + ':' + salt;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  let out = '';
  for (let i = 0; i < 4; i++) { out += ALPHA[h % 36]; h = Math.floor(h / 36); }
  return out;
}

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

async function sign(method, path, query, env) {
  const d = new Date().toISOString().replace(/[-:]/g, '').slice(2, 15) + 'Z'; // yymmddTHHmmssZ
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.COUPANG_SECRET_KEY),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(d + method + path + query));
  return `CEA algorithm=HmacSHA256, access-key=${env.COUPANG_ACCESS_KEY}, signed-date=${d}, signature=${hex(sig)}`;
}

async function call(path, params, env) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${HOST}${path}?${query}`, {
    headers: { Authorization: await sign('GET', path, query, env), 'Content-Type': 'application/json;charset=UTF-8' }
  });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  const j = await res.json();
  if (j.rCode && j.rCode !== '0') throw new Error(`${path} rCode ${j.rCode} ${j.rMessage}`);
  const d = j.data;
  return Array.isArray(d) ? d : (d && d.productData) || [];
}

const norm = (p, category, badge = '') => ({
  id: String(p.productId),
  category,
  name: p.productName,
  price: p.productPrice,
  image: String(p.productImage || '').replace(/^http:/, 'https:'),
  url: p.productUrl,
  badge
});

// 검색창에 친 말을 쿠팡 검색 결과로 바로 보내는 파트너스 링크 (같은 검색어는 30일 동안 다시 만들지 않고 시간당 30번까지만 만든다)
const searchUrl = q => `https://www.coupang.com/np/search?component=&q=${encodeURIComponent(q)}&channel=user`;
async function searchLink(env, q) {
  const target = searchUrl(q);
  if (!env.COUPANG_ACCESS_KEY || !env.COUPANG_SECRET_KEY) return target;
  const cache = caches.default, key = new Request('https://deeplink.local/' + encodeURIComponent(q));
  const hit = await cache.match(key);
  if (hit) return hit.text();
  const G = env.G || env.DATA, hour = Math.floor(Date.now() / 3600e3);
  let o = null;
  try { o = JSON.parse((await G.get('dlq')) || 'null'); } catch (e) {}
  if (!o || o.h !== hour) o = { h: hour, n: 0 };
  if (o.n >= 30) return target; // 호출 한도 보호: 파트너스 링크 없이 일반 검색 주소로 보낸다
  o.n++;
  await G.put('dlq', JSON.stringify(o), { expirationTtl: 3700 });
  try {
    const path = '/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink';
    const res = await fetch(HOST + path, { method: 'POST', headers: { Authorization: await sign('POST', path, '', env), 'Content-Type': 'application/json;charset=UTF-8' }, body: JSON.stringify({ coupangUrls: [target] }), signal: AbortSignal.timeout(8000) });
    if (!res.ok) return target;
    const link = ((await res.json()).data || [])[0];
    if (!link || !link.shortenUrl) return target;
    await cache.put(key, new Response(link.shortenUrl, { headers: { 'cache-control': 'public, max-age=2592000' } }));
    return link.shortenUrl;
  } catch (e) { return target; }
}

// 쿠팡 파트너스 API는 시간당 10회까지라서 검색과 베스트를 합쳐 9회까지만 쓴다 (초과하면 API가 막힐 수 있다)
// 세 사이트가 같은 키를 쓰므로 횟수는 사이트마다 따로 세지 않고 공용 저장소(G)에서 합쳐서 센다
async function allowSearch(env) {
  const G = env.G || env.DATA;
  const hour = Math.floor(Date.now() / 3600e3);
  let o = null;
  try { o = JSON.parse((await G.get('apiq')) || 'null'); } catch (e) {}
  if (!o || o.h !== hour) o = { h: hour, n: 0 };
  if (o.n >= 9) return false;
  o.n++;
  await G.put('apiq', JSON.stringify(o), { expirationTtl: 3700 });
  return true;
}


// 쿠팡 파트너스 API의 이미지 주소(ads-partners)는 실제 이미지 서버로 넘겨주는 중계 주소라서 한꺼번에 많이 열면 막힌다.
// 갱신할 때 서버가 중계를 한 번만 풀어 실제 CDN 주소를 저장하고 방문자는 CDN에서 바로 받는다.
const sha16 = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
const isCdn = u => /^https:\/\/[^/]*coupangcdn\.com\//.test(u || '');
async function resolveImages(env, list, cap = 60) {
  let map = {};
  try { map = JSON.parse((await env.DATA.get('imap')) || '{}'); } catch (e) {}
  const used = new Set();
  const todo = [];
  for (const p of list) {
    if (!/^https:\/\/ads-partners\.coupang\.com\//.test(p.image || '')) continue;
    const k = await sha16(p.image);
    used.add(k);
    if (map[k]) p.image = map[k];
    else todo.push([p, k]);
  }
  let tried = 0;
  for (let i = 0; i < todo.length && tried < cap; i += 5) {
    await Promise.all(todo.slice(i, i + 5).map(async ([p, k]) => {
      tried++;
      try {
        const h = { 'user-agent': 'Mozilla/5.0' };
        let r = await fetch(p.image, { redirect: 'manual', headers: h });
        let loc = r.headers.get('location');
        if (r.body) r.body.cancel().catch(() => {});
        if (!isCdn(loc)) { // 중계가 아니라 다른 방식이면 따라가서 최종 주소를 얻는다
          r = await fetch(p.image, { headers: h });
          loc = r.url;
          if (r.body) r.body.cancel().catch(() => {});
        }
        if (isCdn(loc)) { map[k] = loc; p.image = loc; }
      } catch (e) {}
    }));
  }
  for (const k of Object.keys(map)) if (!used.has(k)) delete map[k];
  await env.DATA.put('imap', JSON.stringify(map));
  return { resolved: Object.keys(map).length, pending: todo.filter(([p]) => !isCdn(p.image)).length };
}

const ym = () => new Date().toISOString().slice(0, 7);
async function imgUsed(env) {
  try { const o = JSON.parse((await env.DATA.get('imgq')) || 'null'); return o && o.m === ym() ? o.n : 0; } catch (e) { return 0; }
}
async function bumpImg(env) {
  try { await env.DATA.put('imgq', JSON.stringify({ m: ym(), n: (await imgUsed(env)) + 1 })); } catch (e) {}
}

// 응답을 엣지에 잠깐 캐시해서 KV와 D1을 매번 읽지 않게 한다
async function edgeJson(url, ctx, ttl, make) {
  const key = new Request(url.origin + url.pathname + '?s=' + url.sid);
  const hit = await caches.default.match(key);
  if (hit) return hit;
  const res = new Response(await make(), { headers: { 'content-type': 'application/json', 'cache-control': `public,max-age=${ttl}` } });
  ctx.waitUntil(caches.default.put(key, res.clone()));
  return res;
}


export function createSite(SITE, mods) {
  // 이 사이트 설정(sites/*.js)에서 분야와 검색어와 분류 규칙을 읽는다
  const { analytics, seo, community } = mods;
  const { track, admin, authed, clickCounts, countRequest, overBudget, pruneOld, recordPrices, getHist } = analytics;
  const communityHandle = community.handle;
  const CATEGORIES = Object.fromEntries(Object.entries(SITE.cats).map(([c, v]) => [c, v.kw]));
  const YEAR = new Date().getFullYear();
  const KW_ALL = Object.entries(CATEGORIES).flatMap(([c, ks]) => (SITE.newSearch ? [[c, `${YEAR} 신형 ${ks[0]}`, 'NEW']] : []).concat(ks.map(k => [c, k, ''])));
  const BEST = SITE.best || [];
  const BLOCK = new RegExp(BASE_BLOCK + (SITE.block ? '|' + SITE.block : ''), 'i');
  const REJECT = (SITE.reject || []).map(r => [new RegExp(r.when, 'i'), new RegExp(r.unless, 'i')]);
  const skipName = nm => BLOCK.test(nm) || REJECT.some(([w, u]) => w.test(nm) && !u.test(nm));
  const RULES = (SITE.classify || []).map(([c, r]) => [c, new RegExp(r)]);
  // strict 사이트는 검색 결과가 그 분야 단어를 이름에 담고 있을 때만 그 분야에 넣는다 (쿠팡 검색이 엉뚱한 상품을 섞어 주는 것을 막는다)
  const MUST = {};
  if (SITE.strict) for (const [c, re] of RULES) (MUST[c] ||= []).push(re);
  const okCat = (c, nm) => !MUST[c] || MUST[c].some(re => re.test(String(nm || '')));
  // 이름이 그 분야 단어와 맞지 않으면 이름에 맞는 다른 분야로 옮기고 어디에도 안 맞으면 뺀다
  const fitCat = (c, nm) => (okCat(c, nm) ? c : (SITE.strict ? classify(String(nm || '')) : c));
  const classify = nm => { for (const [c, re] of RULES) if (re.test(nm)) return c; return ''; }; // 분류할 수 없으면 베스트에서 뺀다

let linksCache = { t: 0, v: {} };
async function getLinks(env) {
  if (Date.now() - linksCache.t < 60000) return linksCache.v;
  const v = JSON.parse((await env.DATA.get('links')) || '{}');
  linksCache = { t: Date.now(), v };
  return v;
}

// 상품 번호로 썸네일을 대신 가져와 원본 주소를 숨기는 프록시 (엣지 캐시)
let prodCache = { t: 0, v: null };
async function getProducts(env) {
  if (Date.now() - prodCache.t < 60000 && prodCache.v) return prodCache.v;
  const v = JSON.parse((await env.DATA.get('products', { cacheTtl: 60 })) || 'null');
  if (v && v.products) v.products = v.products.map(p => ({ ...p, category: fitCat(p.category, p.name) })).filter(p => p.category); // 이미 저장된 엉뚱한 상품은 알맞은 분야로 옮기거나 숨긴다
  prodCache = { t: Date.now(), v };
  return v;
}

async function image(req, url, ctx, env) {
  const id = url.pathname.slice(3);
  const webp = /image\/webp/.test(req.headers.get('accept') || '');
  // 캐시를 먼저 확인해서 적중하면 KV도 읽지 않는다
  const key = new Request(url.origin + url.pathname + (webp ? '?f=w' : '?f=j'));
  const hit = await caches.default.match(key);
  if (hit) return hit;
  const data = await getProducts(env);
  const p = data && data.products.find(x => x.id === id);
  if (!p || !p.image) return new Response('not found', { status: 404 });
  let t;
  try { t = new URL(p.image); } catch (e) { return new Response('bad', { status: 400 }); }
  if (!/^https?:$/.test(t.protocol) || !/(^|\.)(coupangcdn|coupang)\.com$/.test(t.hostname)) return new Response('forbidden', { status: 403 });
  let up;
  try { up = await fetch('https://' + t.host + t.pathname + t.search, { headers: { 'user-agent': 'Mozilla/5.0' }, cf: { cacheTtl: 86400, cacheEverything: true } }); } catch (e) { return new Response('upstream error', { status: 502 }); }
  if (!up.ok) return new Response('upstream ' + up.status, { status: 502 });
  const buf = await up.arrayBuffer();
  let body = buf, type = up.headers.get('content-type') || 'image/jpeg';
  // 카드에 보이는 크기에 맞춰 줄이고 WebP로 바꿔 용량을 크게 줄인다 (실패하면 원본 그대로)
  // 무료 한도(월 5000장)를 넘지 않도록 WebP 요청만 변환하고 월 4000장까지만 변환한다
  if (env.IMAGES && webp && !(await overBudget(env)) && (await imgUsed(env)) < 4000) {
    try {
      const out = await env.IMAGES.input(new Response(buf).body).transform({ width: 480, fit: 'scale-down' }).output({ format: 'image/webp', quality: 78 });
      const small = await out.response().arrayBuffer();
      if (small.byteLength && small.byteLength < buf.byteLength) { body = small; type = 'image/webp'; ctx.waitUntil(bumpImg(env)); }
    } catch (e) { console.error('img', e.message); }
  }
  const res = new Response(body, { headers: { 'content-type': type, 'cache-control': 'public,max-age=2592000', 'vary': 'Accept' } });
  ctx.waitUntil(caches.default.put(key, res.clone()));
  return res;
}

// 클릭 집계는 KV에 저장해 두고 오래되면 뒤에서 갱신한다 (요청이 D1을 기다리지 않게)
let clicksMemo = { t: 0, o: null };
async function getClicks(env, ctx) {
  let o = null;
  if (clicksMemo.o && Date.now() - clicksMemo.t < 60000) o = clicksMemo.o; // 같은 인스턴스에서는 KV를 다시 읽지 않는다
  else {
    try { o = JSON.parse((await env.DATA.get('clicks', { cacheTtl: 60 })) || 'null'); } catch (e) {}
    clicksMemo = { t: Date.now(), o };
  }
  if (env.DB && (!o || Date.now() - o.t > 600000)) {
    ctx.waitUntil((async () => {
      try {
        if (await env.DATA.get('clicks-lock')) return;
        await env.DATA.put('clicks-lock', '1', { expirationTtl: 60 });
        await env.DATA.put('clicks', JSON.stringify({ t: Date.now(), v: await clickCounts(env) }));
      } catch (e) {}
    })());
  }
  return o ? o.v : {};
}

async function refresh(env, opts = {}) {
  const errors = [];
  const seen = new Set();
  const products = [];
  const names = new Set();
  const add = (list, cat, badge) => {
    for (const p of list) {
      const nm = String(p.productName || '').toLowerCase().replace(/\s+/g, '');
      if (!p.productId || seen.has(p.productId) || names.has(nm) || skipName(String(p.productName || ''))) continue;
      const fc = fitCat(cat, p.productName);
      if (!fc) continue;
      seen.add(p.productId);
      names.add(nm);
      products.push(norm(p, fc, badge));
    }
  };
  const slim = p => ({ productId: p.productId, productName: p.productName, productPrice: p.productPrice, productImage: p.productImage, productUrl: p.productUrl });

  // 검색 결과는 검색어별로 KV에 보관하고 이번에는 가장 오래된 검색어부터 일부만 새로 불러온다
  let pool = {};
  try { pool = JSON.parse((await env.DATA.get('pool')) || '{}'); } catch (e) {}
  let prev = null;
  try { prev = JSON.parse((await env.DATA.get('products')) || 'null'); } catch (e) {}
  const have = new Set(((prev && prev.products) || []).map(p => p.category)); // 상품이 아직 없는 카테고리를 먼저 채운다
  // 쿠팡 베스트 목록은 6시간이 지났을 때만 다시 부르고 호출 한도 계산에 같이 넣는다
  const bestKey = n => (n === 0 ? '__best' : n === 1 ? '__bestf' : '__best' + n);
  for (const [n, b] of BEST.entries()) {
    const k = bestKey(n);
    if (pool[k] && Date.now() - pool[k].t < BEST_TTL) continue;
    try {
      if (!(await allowSearch(env))) { errors.push('best ' + b.id + ': 시간당 호출 한도 보호로 건너뜀'); continue; }
      pool[k] = { t: Date.now(), items: (await call(`${BASE}/bestcategories/${b.id}`, { limit: b.limit || 12 }, env)).map(slim) };
    } catch (e) { console.error('best', b.id, e.message); errors.push('best ' + b.id + ': ' + e.message); }
  }
  // 최근 30일 쿠팡 클릭이 많은 분야는 검색어를 더 일찍 갱신한다 (하루에 한 번만 D1 에서 집계해 pool 에 보관)
  let hot = (pool.__bestHot && Date.now() - pool.__bestHot.t < 24 * 3600e3 && pool.__bestHot.w) || null;
  if (!hot && env.DB && prev && prev.products) {
    try {
      const cat = Object.fromEntries(prev.products.map(p => [String(p.id), p.category]));
      const rows = (await env.DB.prepare("SELECT pid, COUNT(*) c FROM hits WHERE type='click' AND bot=0 AND ts>? GROUP BY pid").bind(Date.now() - 30 * 86400e3).all()).results || [];
      const by = {}; let tot = 0;
      for (const r of rows) { const c = cat[String(r.pid)]; if (c) { by[c] = (by[c] || 0) + r.c; tot += r.c; } }
      hot = {}; if (tot >= 20) for (const [c, n] of Object.entries(by)) hot[c] = n / tot; // 클릭이 너무 적으면 쓰지 않는다
      const hotPids = rows.filter(r => r.c >= 2 && cat[String(r.pid)]).sort((a, b) => b.c - a.c).slice(0, 150).map(r => String(r.pid)); // 최근 30일에 두 번 이상 눌린 상품
      pool.__bestHot = { t: Date.now(), w: hot, p: hotPids };
    } catch (e) { hot = {}; }
  }
  const bonus = c => ((hot && hot[c]) || 0) * 12 * 3600e3; // 클릭 비중이 1이면 12시간 더 오래된 것처럼 본다
  const order = KW_ALL.slice().sort((a, b) => ((((pool[a[1]] && pool[a[1]].t) || 0) - bonus(a[0])) - (((pool[b[1]] && pool[b[1]].t) || 0) - bonus(b[0]))) || ((have.has(a[0]) ? 1 : 0) - (have.has(b[0]) ? 1 : 0)));
  let done = 0;
  for (const [cat, kw] of order) {
    if (done >= (opts.perRun || PER_RUN)) break; // 한 시간에 두 사이트를 돌릴 때는 검색 횟수를 나눠 쓴다
    try {
      if (!(await allowSearch(env))) { errors.push('search ' + kw + ': 시간당 호출 한도 보호로 건너뜀'); break; }
      pool[kw] = { t: Date.now(), cat, items: (await call(`${BASE}/search`, { keyword: kw, limit: PER_KEYWORD }, env)).map(slim) };
      done++;
    } catch (e) { console.error('search', kw, e.message); errors.push('search ' + kw + ': ' + e.message); }
  }
  for (const k of Object.keys(pool)) if (!k.startsWith('__best') && !KW_ALL.some(x => x[1] === k)) delete pool[k];
  await env.DATA.put('pool', JSON.stringify(pool));

  for (const [n, b] of BEST.entries()) {
    const bp = pool[bestKey(n)];
    if (!bp) continue;
    if (b.classify) { for (const p of bp.items) { const c = classify(String(p.productName || '')); if (c) add([p], c, 'BEST'); } }
    else add(bp.items, b.cat, 'BEST');
  }
  if (SITE.newSearch) {
    // 분야마다 기본 검색 결과와 올해 신형 검색 결과를 번갈아 배치해 인기와 최신이 함께 앞에 오게 한다
    for (const cat of Object.keys(CATEGORIES)) {
      const base = [], fresh = [];
      for (const [c, kw, badge] of KW_ALL) if (c === cat && pool[kw]) (badge ? fresh : base).push(...pool[kw].items);
      for (let i = 0; i < Math.max(base.length, fresh.length); i++) {
        if (base[i]) add([base[i]], cat, '');
        if (fresh[i]) add([fresh[i]], cat, 'NEW');
      }
    }
  } else {
    for (const [cat, kw] of KW_ALL) if (pool[kw]) add(pool[kw].items, cat, '');
  }

  // 아직 한 번도 불러오지 못한 카테고리는 이전 상품을 그대로 유지한다 (목록이 갑자기 줄지 않게)
  const fresh = new Set(products.map(p => p.category));
  const kept = [];
  let imgStat = null;
  if (prev && prev.products) {
    for (const p of prev.products) {
      if (!fitCat(p.category, p.name) || fresh.has(p.category) || seen.has(p.id) || names.has(String(p.name || '').toLowerCase().replace(/\s+/g, ''))) continue;
      kept.push({ ...p, category: fitCat(p.category, p.name), keep: true });
    }
    // 클릭이 많이 나온 상품은 새 목록에서 빠져도 최대 21일 더 남긴다 (클릭의 절반이 사라진 상품에서 나왔다)
    const hotIds = new Set((pool.__bestHot && pool.__bestHot.p) || []), have2 = new Set(kept.map(p => p.id));
    for (const p of prev.products) {
      if (!hotIds.has(String(p.id)) || seen.has(p.id) || have2.has(p.id) || !fitCat(p.category, p.name) || !fresh.has(p.category)) continue;
      const t0 = p.hk || Date.now();
      if (Date.now() - t0 > 21 * 864e5) continue;
      kept.push({ ...p, category: fitCat(p.category, p.name), hk: t0, keep: true });
    }
  }

  if (products.length) {
    // 쿠팡 링크를 4자리 짧은 링크로 바꾸고 원본은 따로 보관
    const links = JSON.parse((await env.DATA.get('links')) || '{}');
    const byId = {};
    for (const [c, v] of Object.entries(links)) byId[v.i] = c;
    for (const p of products) {
      let c = byId[p.id];
      if (!c) {
        let salt = 0;
        do { c = codeFor(p.id, salt++); } while (links[c] && links[c].i !== p.id);
        byId[p.id] = c;
      }
      links[c] = { u: p.url, n: p.name, i: p.id };
      p.url = '/' + c;
    }
    const keys = Object.keys(links);
    for (const k of keys.slice(0, Math.max(0, keys.length - 3000))) delete links[k];
    await env.DATA.put('links', JSON.stringify(links));
    linksCache = { t: 0, v: {} };
    const all = [...products, ...kept.map(({ keep, ...x }) => x)];
    try { await recordPrices(env, all.map(x => ({ ...x }))); } catch (e) { console.error('price', e.message); }
    try { imgStat = await resolveImages(env, all); } catch (e) { console.error('imgres', e.message); }
    await env.DATA.put('products', JSON.stringify({ updatedAt: new Date().toISOString(), categories: ['전체', ...Object.keys(CATEGORIES)], products: all }));
    // 새로 들어온 상품 페이지와 그 분야 페이지를 검색엔진에 바로 알린다 (IndexNow)
    try {
      const had = new Set(((prev && prev.products) || []).map(p => p.id));
      const fresh = all.filter(p => !had.has(p.id));
      if (fresh.length) {
        const cats = [...new Set(fresh.map(p => p.category))].map(c => `${SITE.host}/c/${encodeURIComponent(c)}`);
        console.log('indexnow', await pingIndexNow(SITE, [`${SITE.host}/`, `${SITE.host}/all`, ...cats, ...fresh.slice(0, 90).map(p => `${SITE.host}/item/${p.id}`)]));
      }
    } catch (e) { console.error('indexnow', e.message); }
  }
  const status = { at: new Date().toISOString(), count: products.length + kept.length, fresh: products.length, searched: done, img: imgStat, errors: errors.slice(0, 8) };
  await env.DATA.put('status', JSON.stringify(status));
  return status;
}


const handler = {
  async fetch(req, env, ctx) {
    const url = new URL(req.url); url.sid = SITE.id;
    const path = url.pathname;
    // 취약점 스캐너가 찾는 경로는 저장소를 건드리지 않고 바로 404로 돌려보낸다 (요청 수 집계와 CPU를 아낀다)
    if (SCAN.test(path)) return new Response('Not found', { status: 404, headers: { 'cache-control': 'public,max-age=3600', 'x-robots-tag': 'noindex' } });
    countRequest(env, ctx);
    if (path === '/0') return admin(req, env, url);
    if (/^\/i\/\d+$/.test(path)) return image(req, url, ctx, env);
    if (path === '/api/clicks') return new Response(JSON.stringify(await getClicks(env, ctx)), { headers: { 'content-type': 'application/json', 'cache-control': 'public,max-age=60,stale-while-revalidate=300' } });
    if (/^\/api\/(posts|comments)(\/|$)/.test(path)) {
      if (!env.DB) return new Response('{"error":"db"}', { status: 500 });
      if (req.method === 'GET' && path === '/api/posts') { // 글 목록은 엣지에 30초 캐시
        const key = new Request(url.origin + url.pathname + url.search + (url.search ? '&' : '?') + 's=' + url.sid);
        const hit = await caches.default.match(key);
        if (hit) return hit;
        const res = await communityHandle(req, env, url, ctx);
        if (!res.ok) return res;
        const r = new Response(res.body, res);
        r.headers.set('cache-control', 'public,max-age=30');
        ctx.waitUntil(caches.default.put(key, r.clone()));
        return r;
      }
      return communityHandle(req, env, url, ctx);
    }
    if (path.startsWith('/s/')) { // 검색창에 친 말을 쿠팡 검색 결과로 바로 보낸다 (안내 페이지를 거쳐 파트너스 링크로)
      let q = '';
      try { q = decodeURIComponent(path.slice(3)).trim().slice(0, 60); } catch (e) {}
      if (!q) return new Response(null, { status: 302, headers: { Location: '/' } });
      if (/bot|spider|crawl|slurp|preview|facebookexternalhit|curl|python|go-http|monitor/i.test(req.headers.get('user-agent') || '')) return new Response('Not found', { status: 404 });
      const g = url.searchParams.get('go');
      const code = 's/' + encodeURIComponent(q);
      if (g) {
        if (g !== 'a') ctx.waitUntil(track(env, req, { type: 'click', code, pid: 'search', name: q + ' (검색)' }));
        return new Response(null, { status: 302, headers: { Location: await searchLink(env, q), 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
      }
      return goPage(SITE, code, { name: `"${q}" 쿠팡 검색 결과` });
    }
    if (/^\/[a-z0-9]{4}$/.test(path)) {
      const link = (await getLinks(env))[path.slice(1)];
      if (link) {
        const code = path.slice(1);
        const direct = () => new Response(null, { status: 302, headers: { Location: link.u, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
        const g = url.searchParams.get('go');
        if (g === 'a') return direct(); // 관리자가 통계에서 누른 링크는 세지 않고 바로 보낸다
        if (g) { ctx.waitUntil(track(env, req, { type: 'click', code, pid: link.i, name: link.n })); return direct(); } // 안내 페이지에서 실제로 쿠팡으로 넘어갈 때 한 번 센다
        if (/bot|spider|crawl|slurp|preview|facebookexternalhit|curl|python|go-http|monitor/i.test(req.headers.get('user-agent') || '')) return direct(); // 검색 로봇과 링크 검사기는 바로 보낸다
        const d = await getProducts(env).catch(() => null);
        return goPage(SITE, code, ((d && d.products) || []).find(x => x.id === link.i));
      }
    }
    if (path === '/' || path === '/index.html') ctx.waitUntil(track(env, req, { type: 'view' }));
    { const sr = await seo(req, env, url, ctx, { products: getProducts, clicks: () => getClicks(env, ctx), hist: id => getHist(env, id) }); if (sr) return sr; }
    if (url.pathname === '/api/debug') {
      if (!authed(req, env)) return new Response('Not found', { status: 404 }); // 환경 정보는 관리자만 본다
      const info = { version: env.CF_VERSION_METADATA && env.CF_VERSION_METADATA.id, versionAt: env.CF_VERSION_METADATA && env.CF_VERSION_METADATA.timestamp, envKeys: Object.keys(env), hasKeys: !!(env.COUPANG_ACCESS_KEY && env.COUPANG_SECRET_KEY), keyLen: [(env.COUPANG_ACCESS_KEY || '').length, (env.COUPANG_SECRET_KEY || '').length] };
      if (url.searchParams.get('run') === '1' && info.hasKeys && !(await env.DATA.get('lock'))) {
        await env.DATA.put('lock', '1', { expirationTtl: 300 });
        info.run = await refresh(env);
      }
      info.status = JSON.parse((await env.DATA.get('status')) || 'null');
      info.hasProducts = !!(await env.DATA.get('products'));
      return new Response(JSON.stringify(info, null, 1), { headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname === '/api/products') {
      const hit = await caches.default.match(new Request(url.origin + url.pathname + '?s=' + url.sid));
      if (hit) return hit;
      const d = await getProducts(env);
      if (d) {
        const body = JSON.stringify({ ...d, products: d.products.map(({ rocket, ...x }) => x) });
        return edgeJson(url, ctx, 300, async () => body);
      }
      // 저장된 상품이 없으면 백그라운드에서 즉시 갱신 (5분 잠금)
      if (env.COUPANG_ACCESS_KEY && !(await env.DATA.get('lock'))) {
        await env.DATA.put('lock', '1', { expirationTtl: 300 });
        ctx.waitUntil(refresh(env));
      }
      return new Response(JSON.stringify({ categories: ['전체', ...Object.keys(CATEGORIES)], products: [] }), { headers: { 'content-type': 'application/json', 'cache-control': 'public,max-age=60' } });
    }
    return env.ASSETS.fetch(req);
  },
  async scheduled(_evt, env, ctx) {
    if (new Date().getUTCHours() === 20) ctx.waitUntil(pruneOld(env)); // 하루에 한 번만 오래된 기록 정리
    ctx.waitUntil(refresh(env));
  }
};

  return { fetch: handler.fetch, refresh, scheduled: handler.scheduled, analytics };
}
