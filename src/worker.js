import { seo } from './seo.js';
import { track, admin, clickCounts, countRequest, overBudget, pruneOld, recordPrices, getHist } from './analytics.js';
import { handle as community } from './community.js';

const HOST = 'https://api-gateway.coupang.com';
const BASE = '/v2/providers/affiliate_open_api/apis/openapi/v1/products';

// 카테고리별 검색어와 베스트 카테고리 ID 설정
const CATEGORIES = {
  '스킨케어': ['토너', '에센스'],
  '선케어': ['선크림'],
  '클렌징': ['클렌징폼', '클렌징오일'],
  '메이크업': ['쿠션', '립틴트'],
  '바디헤어': ['샴푸']
};
const BEST_BEAUTY_ID = 1010;
const PER_KEYWORD = 6;

const ALPHA = '0123456789abcdefghijklmnopqrstuvwxyz';
function codeFor(id, salt) {
  let h = 2166136261 >>> 0;
  const s = id + ':' + salt;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  let out = '';
  for (let i = 0; i < 4; i++) { out += ALPHA[h % 36]; h = Math.floor(h / 36); }
  return out;
}

let linksCache = { t: 0, v: {} };
async function getLinks(env) {
  if (Date.now() - linksCache.t < 60000) return linksCache.v;
  const v = JSON.parse((await env.DATA.get('links')) || '{}');
  linksCache = { t: Date.now(), v };
  return v;
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

// 쿠팡 파트너스 검색 API는 시간당 10회까지라서 안전하게 8회까지만 쓴다 (초과하면 API가 막힐 수 있다)
async function allowSearch(env) {
  const hour = Math.floor(Date.now() / 3600e3);
  let o = null;
  try { o = JSON.parse((await env.DATA.get('apiq')) || 'null'); } catch (e) {}
  if (!o || o.h !== hour) o = { h: hour, n: 0 };
  if (o.n >= 8) return false;
  o.n++;
  await env.DATA.put('apiq', JSON.stringify(o), { expirationTtl: 3700 });
  return true;
}

async function refresh(env) {
  const errors = [];
  const seen = new Set();
  const products = [];
  const names = new Set();
  const add = (list, cat, badge) => {
    for (const p of list) {
      const nm = String(p.productName || '').toLowerCase().replace(/\s+/g, '');
      if (!p.productId || seen.has(p.productId) || names.has(nm)) continue;
      seen.add(p.productId);
      names.add(nm);
      products.push(norm(p, cat, badge));
    }
  };
  try {
    add((await call(`${BASE}/bestcategories/${BEST_BEAUTY_ID}`, { limit: 12 }, env)), '스킨케어', 'BEST');
  } catch (e) { console.error('best', e.message); errors.push('best: ' + e.message); }
  for (const [cat, kws] of Object.entries(CATEGORIES)) {
    for (const kw of kws) {
      try {
        if (!(await allowSearch(env))) { errors.push('search ' + kw + ': 시간당 호출 한도 보호로 건너뜀'); continue; }
        add(await call(`${BASE}/search`, { keyword: kw, limit: PER_KEYWORD }, env), cat, '');
      }
      catch (e) { console.error('search', kw, e.message); errors.push('search ' + kw + ': ' + e.message); }
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
    try { await recordPrices(env, products.map(x => ({ ...x }))); } catch (e) { console.error('price', e.message); }
    await env.DATA.put('products', JSON.stringify({ updatedAt: new Date().toISOString(), categories: ['전체', ...Object.keys(CATEGORIES)], products }));
  }
  const status = { at: new Date().toISOString(), count: products.length, errors: errors.slice(0, 8) };
  await env.DATA.put('status', JSON.stringify(status));
  return status;
}

// 상품 번호로 썸네일을 대신 가져와 원본 주소를 숨기는 프록시 (엣지 캐시)
let prodCache = { t: 0, v: null };
async function getProducts(env) {
  if (Date.now() - prodCache.t < 60000 && prodCache.v) return prodCache.v;
  const v = JSON.parse((await env.DATA.get('products', { cacheTtl: 60 })) || 'null');
  prodCache = { t: Date.now(), v };
  return v;
}

const ym = () => new Date().toISOString().slice(0, 7);
async function imgUsed(env) {
  try { const o = JSON.parse((await env.DATA.get('imgq')) || 'null'); return o && o.m === ym() ? o.n : 0; } catch (e) { return 0; }
}
async function bumpImg(env) {
  try { await env.DATA.put('imgq', JSON.stringify({ m: ym(), n: (await imgUsed(env)) + 1 })); } catch (e) {}
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

// 응답을 엣지에 잠깐 캐시해서 KV와 D1을 매번 읽지 않게 한다
async function edgeJson(url, ctx, ttl, make) {
  const key = new Request(url.origin + url.pathname);
  const hit = await caches.default.match(key);
  if (hit) return hit;
  const res = new Response(await make(), { headers: { 'content-type': 'application/json', 'cache-control': `public,max-age=${ttl}` } });
  ctx.waitUntil(caches.default.put(key, res.clone()));
  return res;
}

// 클릭 집계는 KV에 저장해 두고 오래되면 뒤에서 갱신한다 (요청이 D1을 기다리지 않게)
async function getClicks(env, ctx) {
  let o = null;
  try { o = JSON.parse((await env.DATA.get('clicks', { cacheTtl: 60 })) || 'null'); } catch (e) {}
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

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const path = url.pathname;
    countRequest(env, ctx);
    if (path === '/0') return admin(req, env, url);
    if (/^\/i\/\d+$/.test(path)) return image(req, url, ctx, env);
    if (path === '/api/clicks') return new Response(JSON.stringify(await getClicks(env, ctx)), { headers: { 'content-type': 'application/json', 'cache-control': 'public,max-age=60,stale-while-revalidate=300' } });
    if (/^\/api\/(posts|comments)(\/|$)/.test(path)) {
      if (!env.DB) return new Response('{"error":"db"}', { status: 500 });
      if (req.method === 'GET' && path === '/api/posts') { // 글 목록은 엣지에 30초 캐시
        const key = new Request(url.origin + url.pathname + url.search);
        const hit = await caches.default.match(key);
        if (hit) return hit;
        const res = await community(req, env, url, ctx);
        if (!res.ok) return res;
        const r = new Response(res.body, res);
        r.headers.set('cache-control', 'public,max-age=30');
        ctx.waitUntil(caches.default.put(key, r.clone()));
        return r;
      }
      return community(req, env, url, ctx);
    }
    if (/^\/[a-z0-9]{4}$/.test(path)) {
      const link = (await getLinks(env))[path.slice(1)];
      if (link) {
        ctx.waitUntil(track(env, req, { type: 'click', code: path.slice(1), pid: link.i, name: link.n }));
        return new Response(null, { status: 302, headers: { Location: link.u, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
      }
    }
    if (path === '/' || path === '/index.html') ctx.waitUntil(track(env, req, { type: 'view' }));
    { const sr = await seo(req, env, url, ctx, { products: getProducts, clicks: () => getClicks(env, ctx), hist: id => getHist(env, id) }); if (sr) return sr; }
    if (url.pathname === '/api/debug') {
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
      const hit = await caches.default.match(new Request(url.origin + url.pathname));
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
      return env.ASSETS.fetch(new Request(new URL('/products.json', url), req));
    }
    return env.ASSETS.fetch(req);
  },
  async scheduled(_evt, env, ctx) {
    ctx.waitUntil(pruneOld(env));
    ctx.waitUntil(refresh(env));
  }
};
