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
  } catch (e) { console.error('best', e.message); }
  for (const [cat, kws] of Object.entries(CATEGORIES)) {
    for (const kw of kws) {
      try { add(await call(`${BASE}/search`, { keyword: kw, limit: PER_KEYWORD }, env), cat, ''); }
      catch (e) { console.error('search', kw, e.message); }
    }
  }
  if (products.length) {
    await env.DATA.put('products', JSON.stringify({ updatedAt: new Date().toISOString(), categories: ['전체', ...Object.keys(CATEGORIES)], products }));
  }
  return products.length;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/api/products') {
      const stored = await env.DATA.get('products');
      if (stored) return new Response(stored, { headers: { 'content-type': 'application/json', 'cache-control': 'public,max-age=600' } });
      return env.ASSETS.fetch(new Request(new URL('/products.json', url), req));
    }
    return env.ASSETS.fetch(req);
  },
  async scheduled(_evt, env, ctx) {
    ctx.waitUntil(refresh(env));
  }
};
