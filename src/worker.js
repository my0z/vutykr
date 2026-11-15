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
    await env.DATA.put('products', JSON.stringify({ updatedAt: new Date().toISOString(), categories: ['전체', ...Object.keys(CATEGORIES)], products }));
  }
  const status = { at: new Date().toISOString(), count: products.length, errors: errors.slice(0, 8) };
  await env.DATA.put('status', JSON.stringify(status));
  return status;
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
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
