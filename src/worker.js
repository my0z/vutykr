import { track, admin } from './analytics.js';
import { handle as community } from './community.js';

const HOST = 'https://api-gateway.coupang.com';
const BASE = '/v2/providers/affiliate_open_api/apis/openapi/v1/products';

// 카테고리별 검색어와 베스트 카테고리 ID 설정
const CATEGORIES = {
  '스킨케어': ['토너', '에센스', '크림'],
  '선케어': ['선크림', '선스틱'],
  '클렌징': ['클렌징폼', '클렌징오일'],
  '메이크업': ['쿠션', '립틴트'],
  '바디헤어': ['바디로션', '샴푸']
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
  image: p.productImage,
  url: p.productUrl,
  rocket: !!p.isRocket,
  badge
});

async function refresh(env) {
  const errors = [];
  const seen = new Set();
  const products = [];
  const add = (list, cat, badge) => {
    for (const p of list) {
      if (!p.productId || seen.has(p.productId)) continue;
      seen.add(p.productId);
      products.push(norm(p, cat, badge));
    }
  };
  try {
    add((await call(`${BASE}/bestcategories/${BEST_BEAUTY_ID}`, { limit: 12 }, env)), '스킨케어', 'BEST');
  } catch (e) { console.error('best', e.message); errors.push('best: ' + e.message); }
  for (const [cat, kws] of Object.entries(CATEGORIES)) {
    for (const kw of kws) {
      try { add(await call(`${BASE}/search`, { keyword: kw, limit: PER_KEYWORD }, env), cat, ''); }
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
    await env.DATA.put('products', JSON.stringify({ updatedAt: new Date().toISOString(), categories: ['전체', ...Object.keys(CATEGORIES)], products }));
  }
  const status = { at: new Date().toISOString(), count: products.length, errors: errors.slice(0, 8) };
  await env.DATA.put('status', JSON.stringify(status));
  return status;
}

// 쿠팡 이미지 서버만 허용하는 썸네일 프록시 (엣지 캐시)
async function image(url, ctx) {
  let t;
  try { t = new URL(url.searchParams.get('u') || ''); } catch (e) { return new Response('bad', { status: 400 }); }
  if (!/^https?:$/.test(t.protocol) || !/(^|\.)coupangcdn\.com$/.test(t.hostname)) return new Response('forbidden', { status: 403 });
  const key = new Request(url.toString());
  const hit = await caches.default.match(key);
  if (hit) return hit;
  const up = await fetch('https://' + t.host + t.pathname + t.search, { headers: { 'user-agent': 'Mozilla/5.0' }, cf: { cacheTtl: 86400, cacheEverything: true } });
  if (!up.ok) return new Response('upstream ' + up.status, { status: 502 });
  const res = new Response(up.body, { headers: { 'content-type': up.headers.get('content-type') || 'image/jpeg', 'cache-control': 'public,max-age=86400' } });
  ctx.waitUntil(caches.default.put(key, res.clone()));
  return res;
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const path = url.pathname;
    if (path === '/0') return admin(req, env, url);
    if (path === '/img') return image(url, ctx);
    if (/^\/api\/(posts|comments)(\/|$)/.test(path)) return env.DB ? community(req, env, url, ctx) : new Response('{"error":"db"}', { status: 500 });
    if (/^\/[a-z0-9]{4}$/.test(path)) {
      const link = (await getLinks(env))[path.slice(1)];
      if (link) {
        ctx.waitUntil(track(env, req, { type: 'click', code: path.slice(1), pid: link.i, name: link.n }));
        return new Response(null, { status: 302, headers: { Location: link.u, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
      }
    }
    if (path === '/' || path === '/index.html') ctx.waitUntil(track(env, req, { type: 'view' }));
    if (url.pathname === '/api/debug') {
      const info = { envKeys: Object.keys(env), hasKeys: !!(env.COUPANG_ACCESS_KEY && env.COUPANG_SECRET_KEY), keyLen: [(env.COUPANG_ACCESS_KEY || '').length, (env.COUPANG_SECRET_KEY || '').length] };
      if (url.searchParams.get('run') === '1' && info.hasKeys && !(await env.DATA.get('lock'))) {
        await env.DATA.put('lock', '1', { expirationTtl: 300 });
        info.run = await refresh(env);
      }
      info.status = JSON.parse((await env.DATA.get('status')) || 'null');
      info.hasProducts = !!(await env.DATA.get('products'));
      return new Response(JSON.stringify(info, null, 1), { headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname === '/api/products') {
      const stored = await env.DATA.get('products');
      if (stored) return new Response(stored, { headers: { 'content-type': 'application/json', 'cache-control': 'public,max-age=600' } });
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
    ctx.waitUntil(refresh(env));
  }
};
