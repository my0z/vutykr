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
  '바디헤어': ['샴푸'],
  '의류': ['원피스', '블라우스', '니트 여성', '가디건 여성', '여성 청바지', '스커트', '여성 코트', '여성 패딩'],
  '신발': ['여성 운동화', '여성 로퍼', '여성 샌들', '여성 부츠'],
  '가방': ['여성 숄더백', '여성 크로스백', '여성 백팩', '여성 지갑'],
  '장신구': ['반지', '귀걸이', '목걸이', '팔찌', '헤어핀'],
  '잡화': ['여성 모자', '스카프', '여성 양말', '여성 벨트', '선글라스']
};
const KW_ALL = Object.entries(CATEGORIES).flatMap(([c, ks]) => ks.map(k => [c, k]));
const PER_RUN = 6; // 한 번에 가장 오래된 검색어 6개만 갱신 (쿠팡 검색 API는 시간당 10회 제한)
// 쿠팡 파트너스 운영정책상 홍보하면 안 되는 상품(이미테이션과 성인용품)과 이 사이트와 맞지 않는 상품을 걸러낸다
const BLOCK = /이미테이션|짝퉁|레플리카|replica|모조품|카피|정품급|[SA]급|성인|19금|콘돔|딜도|바이브|자위|애널|러브젤|아동|키즈|유아|베이비|수능|바라클라바|오토바이|넥\s?게이터|(샤넬|구찌|루이비통|프라다|에르메스|디올|버버리|카르티에|까르띠에|티파니|보테가)\s?(st|ST|스타일|풍|느낌|룩)/;
const MALE = /남성|남자|맨즈|\bmen\b/i;
const FEMALE = /여성|여자|우먼|woman|women|공용|남녀/i;
const skipName = nm => BLOCK.test(nm) || (MALE.test(nm) && !FEMALE.test(nm));
// 패션 베스트 목록은 여러 종류가 섞여 있어서 상품명으로 카테고리를 나눈다
const classify = nm => /반지|귀걸이|목걸이|팔찌|발찌|헤어핀|브로치/.test(nm) ? '장신구'
  : /신발|운동화|샌들|슬리퍼|부츠|구두|로퍼|스니커즈|힐/.test(nm) ? '신발'
  : /가방|백팩|숄더백|크로스백|토트백|클러치|지갑|파우치/.test(nm) ? '가방'
  : /원피스|블라우스|셔츠|티셔츠|니트|가디건|바지|팬츠|청바지|치마|스커트|자켓|재킷|코트|패딩|후드|맨투맨|점퍼|레깅스/.test(nm) ? '의류'
  : /모자|스카프|머플러|양말|벨트|선글라스|장갑|머리끈|헤어밴드|시계/.test(nm) ? '잡화' : ''; // 분류할 수 없으면 베스트에서 뺀다
const BEST_FASHION_ID = 1001;
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

async function refresh(env) {
  const errors = [];
  const seen = new Set();
  const products = [];
  const names = new Set();
  const add = (list, cat, badge) => {
    for (const p of list) {
      const nm = String(p.productName || '').toLowerCase().replace(/\s+/g, '');
      if (!p.productId || seen.has(p.productId) || names.has(nm) || skipName(String(p.productName || ''))) continue;
      seen.add(p.productId);
      names.add(nm);
      products.push(norm(p, cat, badge));
    }
  };
  const slim = p => ({ productId: p.productId, productName: p.productName, productPrice: p.productPrice, productImage: p.productImage, productUrl: p.productUrl });

  // 검색 결과는 검색어별로 KV에 보관하고 이번에는 가장 오래된 검색어부터 일부만 새로 불러온다
  let pool = {};
  try { pool = JSON.parse((await env.DATA.get('pool')) || '{}'); } catch (e) {}
  let prev = null;
  try { prev = JSON.parse((await env.DATA.get('products')) || 'null'); } catch (e) {}
  const have = new Set(((prev && prev.products) || []).map(p => p.category)); // 상품이 아직 없는 카테고리를 먼저 채운다
  try {
    pool.__best = { t: Date.now(), items: (await call(`${BASE}/bestcategories/${BEST_BEAUTY_ID}`, { limit: 12 }, env)).map(slim) };
  } catch (e) { console.error('best', e.message); errors.push('best: ' + e.message); }
  try {
    pool.__bestf = { t: Date.now(), items: (await call(`${BASE}/bestcategories/${BEST_FASHION_ID}`, { limit: 12 }, env)).map(slim) };
  } catch (e) { console.error('bestf', e.message); errors.push('bestf: ' + e.message); }
  const order = KW_ALL.slice().sort((a, b) => (((pool[a[1]] && pool[a[1]].t) || 0) - ((pool[b[1]] && pool[b[1]].t) || 0)) || ((have.has(a[0]) ? 1 : 0) - (have.has(b[0]) ? 1 : 0)));
  let done = 0;
  for (const [cat, kw] of order) {
    if (done >= PER_RUN) break;
    try {
      if (!(await allowSearch(env))) { errors.push('search ' + kw + ': 시간당 호출 한도 보호로 건너뜀'); break; }
      pool[kw] = { t: Date.now(), cat, items: (await call(`${BASE}/search`, { keyword: kw, limit: PER_KEYWORD }, env)).map(slim) };
      done++;
    } catch (e) { console.error('search', kw, e.message); errors.push('search ' + kw + ': ' + e.message); }
  }
  for (const k of Object.keys(pool)) if (k !== '__best' && k !== '__bestf' && !KW_ALL.some(x => x[1] === k)) delete pool[k];
  await env.DATA.put('pool', JSON.stringify(pool));

  if (pool.__best) add(pool.__best.items, '스킨케어', 'BEST');
  if (pool.__bestf) for (const p of pool.__bestf.items) { const c = classify(String(p.productName || '')); if (c) add([p], c, 'BEST'); }
  for (const [cat, kw] of KW_ALL) if (pool[kw]) add(pool[kw].items, cat, '');

  // 아직 한 번도 불러오지 못한 카테고리는 이전 상품을 그대로 유지한다 (목록이 갑자기 줄지 않게)
  const fresh = new Set(products.map(p => p.category));
  const kept = [];
  let imgStat = null;
  if (prev && prev.products) {
    for (const p of prev.products) {
      if (fresh.has(p.category) || seen.has(p.id) || names.has(String(p.name || '').toLowerCase().replace(/\s+/g, ''))) continue;
      kept.push({ ...p, keep: true });
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
  }
  const status = { at: new Date().toISOString(), count: products.length + kept.length, fresh: products.length, searched: done, img: imgStat, errors: errors.slice(0, 8) };
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
    if (new Date().getUTCHours() === 20) ctx.waitUntil(pruneOld(env)); // 하루에 한 번만 오래된 기록 정리
    ctx.waitUntil(refresh(env));
  }
};
