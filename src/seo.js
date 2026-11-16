// SEO와 AEO 공용 모듈: 메타태그 JSON-LD 서버 렌더링 sitemap robots llms.txt
import { SITE, DISC, GUIDE } from './site.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ld = o => `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', ...o }).replace(/</g, '\\u003c')}</script>`;
const abs = p => (/^https?:/.test(p) ? p : SITE.host + p);
const won = n => (n ? `${n}원` : '가격 확인');
const catUrl = c => `/c/${encodeURIComponent(c)}`;

let cache = { t: 0, v: null };
async function load(env) {
  if (Date.now() - cache.t < 60000) return cache.v;
  let v = null;
  try { v = JSON.parse((await env.DATA.get('products')) || 'null'); } catch (e) {}
  cache = { t: Date.now(), v };
  return v;
}

function product(p) {
  const o = { '@type': 'Product', name: p.name, url: abs(p.url), category: p.category };
  if (p.image) o.image = p.image;
  if (p.price) o.offers = { '@type': 'Offer', priceCurrency: 'KRW', price: p.price, url: abs(p.url) };
  return o;
}
const itemList = (list, name) => ({
  '@type': 'ItemList', name,
  itemListElement: list.map((p, i) => ({ '@type': 'ListItem', position: i + 1, item: product(p) }))
});
const crumbs = items => ld({
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([n, u], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: abs(u) }))
});
const faqLd = () => ld({
  '@type': 'FAQPage',
  mainEntity: SITE.faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }))
});
const li = list => `<ul>${list.map(p => `<li><a href="${esc(p.url)}" rel="sponsored nofollow">${esc(p.name)}</a> ${won(p.price)}</li>`).join('')}</ul>`;
const faqHtml = () => `<section class="faq"><h2>자주 묻는 질문</h2>${SITE.faq.map(f => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</section>`;
const nav = () => `<nav><a href="/">홈</a> <a href="/all">전체 상품</a> ${Object.keys(SITE.cats).map(c => `<a href="${catUrl(c)}">${esc(c)}</a>`).join(' ')}</nav>`;

function route(p) {
  if (p === '/' || p === '/index.html') return { t: 'home' };
  if (p === '/all') return { t: 'all' };
  const im = p.match(/^\/item\/(\d{1,20})$/);
  if (im) return { t: 'item', id: im[1] };
  const m = p.match(/^\/c\/(.+)$/);
  if (m) {
    let c = '';
    try { c = decodeURIComponent(m[1]); } catch (e) { return null; }
    if (SITE.cats[c]) return { t: 'cat', c };
  }
  return null;
}


const fmt = n => Number(n).toLocaleString('ko-KR');
const mdate = ts => { const d = new Date(ts + 9 * 3600e3); return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`; };

// 상품명에 용량이 하나만 적혀 있을 때만 단위 가격을 추정한다 (묶음 상품은 계산하지 않는다)
function unitPrice(name, price) {
  if (!price) return '';
  const rest = name.replace(/\d+(?:\.\d+)?\s?(?:ml|g|kg|l)\b/gi, ' ');
  if (/\d+\s?(?:개입|개|입|팩|세트|set|매|병|통|ea)|[x×*+]\s?\d/i.test(rest)) return '';
  const m = [...name.matchAll(/(\d+(?:\.\d+)?)\s?(ml|g|kg|l)\b/gi)];
  if (m.length !== 1) return '';
  let v = parseFloat(m[0][1]);
  const u = m[0][2].toLowerCase();
  if (u === 'kg' || u === 'l') v *= 1000;
  if (!v || v < 5) return '';
  return `${Math.round(price / v * 100)}원 (${u === 'ml' || u === 'l' ? '100ml' : '100g'}당)`;
}

function spark(h) {
  if (h.length < 2) return '';
  const W = 640, H = 140, P = 12;
  const ps = h.map(x => x.price), mn = Math.min(...ps), mx = Math.max(...ps), rg = mx - mn || 1;
  const x = i => P + i * (W - 2 * P) / (h.length - 1);
  const y = v => H - P - (v - mn) * (H - 2 * P) / rg;
  const pts = h.map((r, i) => `${x(i).toFixed(1)},${y(r.price).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" class="spark" role="img" aria-label="가격 변화 그래프"><polyline fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" points="${pts}"/>${h.map((r, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(r.price).toFixed(1)}" r="4" fill="currentColor"/>`).join('')}</svg>`;
}

function buildItem(p, list, hist) {
  const cat = p.category;
  const same = list.filter(x => x.category === cat);
  const byPrice = same.filter(x => x.price).sort((a, b) => a.price - b.price);
  const idx = byPrice.findIndex(x => x.id === p.id);
  const start = Math.max(0, Math.min(Math.max(0, byPrice.length - 8), idx - 3));
  const near = byPrice.slice(start, start + 8);
  const similar = same.filter(x => x.id !== p.id).slice(0, 4);
  const unit = unitPrice(p.name, p.price);
  const prices = hist.map(r => r.price);
  let trend = '';
  if (hist.length >= 2) trend = `<p>${mdate(hist[0].ts)}부터 기록한 가격 중 가장 낮은 값은 ${fmt(Math.min(...prices))}원 가장 높은 값은 ${fmt(Math.max(...prices))}원이고 마지막으로 바뀐 날은 ${mdate(hist[hist.length - 1].ts)}입니다.</p>`;
  else if (hist.length === 1) trend = `<p>${mdate(hist[0].ts)}부터 이 상품의 가격을 기록하고 있으며 지금까지 가격이 바뀐 적은 없습니다.</p>`;
  else trend = '<p>이 상품의 가격 기록을 쌓는 중입니다. 여섯 시간마다 확인해 가격이 바뀌면 이곳에 표시합니다.</p>';
  const facts = [
    ['카테고리', cat],
    ['쿠팡 판매가', p.price ? `${fmt(p.price)}원` : '쿠팡에서 확인'],
    unit ? ['단위 가격', unit + ' 상품명의 용량 기준 추정'] : null,
    idx >= 0 ? ['같은 카테고리 가격 순위', `${byPrice.length}개 중 ${idx + 1}번째로 저렴 (이 사이트에 담긴 상품 기준)`] : null
  ].filter(Boolean);
  const title = `${p.name} 가격 정보 | ${SITE.name}`;
  const desc = `${p.name} ${cat} 상품의 쿠팡 판매가${p.price ? ' ' + p.price + '원' : ''}과 가격 변화와 같은 카테고리 가격 비교와 고르는 법을 정리했습니다`.slice(0, 150);
  const tip = (GUIDE[cat] || []).map(t => `<li>${esc(t)}</li>`).join('');
  const body = `<article class="ip ssr" data-cat="${esc(cat)}">
<nav class="crumb"><a href="/">홈</a> › <a href="${catUrl(cat)}">${esc(cat)}</a> › <span>상품 정보</span></nav>
<div class="ip-top"><div class="ip-img">${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" fetchpriority="high" decoding="async" referrerpolicy="no-referrer">` : '<span>🌸</span>'}</div>
<div class="ip-info"><span class="bd">${esc(cat)}</span><h1>${esc(p.name)}</h1>
<div class="ip-price">${p.price ? `${fmt(p.price)}<small>원</small>` : '가격 확인'}</div>
<p class="ip-note">쿠팡 파트너스 데이터 기준이며 실제 가격과 재고는 쿠팡에서 바뀔 수 있습니다.</p>
<a class="ip-cta" href="${esc(p.url)}" target="_blank" rel="sponsored nofollow noopener">쿠팡에서 최신 가격 확인하기</a>
<p class="disc">${esc(DISC)}</p></div></div>
<section><h2>상품 한눈에 보기</h2><table class="ip-table"><tbody>${facts.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table></section>
<section><h2>가격 변화</h2>${spark(hist)}${trend}<p class="ip-note">여섯 시간마다 쿠팡 파트너스 데이터를 불러올 때 가격이 바뀐 경우만 기록한 값입니다.</p></section>
<section><h2>${esc(cat)} 가격 비교</h2><table class="ip-table cmp"><thead><tr><th>상품</th><th>쿠팡 판매가</th></tr></thead><tbody>${near.map(x => `<tr class="${x.id === p.id ? 'me' : ''}"><td><a href="/item/${esc(x.id)}">${esc(x.name)}</a></td><td>${fmt(x.price)}원</td></tr>`).join('')}</tbody></table></section>
${tip ? `<section><h2>${esc(cat)} 고를 때 확인할 점</h2><ul class="ip-tips">${tip}</ul></section>` : ''}
${similar.length ? `<section><h2>같은 카테고리의 다른 상품</h2><div class="ip-sim">${similar.map(x => `<a href="/item/${esc(x.id)}">${x.image ? `<img src="${esc(x.image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : '<span>🌸</span>'}<b>${esc(x.name)}</b><em>${x.price ? fmt(x.price) + '원' : ''}</em></a>`).join('')}</div></section>` : ''}
</article>`;
  return {
    title, desc, canonical: abs('/item/' + p.id), body,
    ld: [
      crumbs([['홈', '/'], [cat, catUrl(cat)], [p.name, '/item/' + p.id]]),
      ld({ ...product(p), '@id': abs('/item/' + p.id), url: abs('/item/' + p.id), description: desc, offers: p.price ? { '@type': 'Offer', priceCurrency: 'KRW', price: p.price, url: abs(p.url) } : undefined })
    ]
  };
}

function build(r, list) {
  if (r.t === 'item') return buildItem(r.p, list, r.hist || []);
  const top = list.slice(0, 20);
  if (r.t === 'home') {
    let body = `<section class="ssr"><h1>${esc(SITE.h1)}</h1><p>${esc(SITE.intro)}</p>${nav()}`;
    body += `<h2>실시간 BEST 랭킹</h2>${li(top.slice(0, 10))}`;
    for (const c of Object.keys(SITE.cats)) {
      const l = list.filter(p => p.category === c).slice(0, 5);
      if (l.length) body += `<h2><a href="${catUrl(c)}">${esc(c)} 인기 랭킹</a></h2>${li(l)}`;
    }
    body += `</section>${faqHtml()}`;
    return {
      title: SITE.title, desc: SITE.desc, canonical: abs('/'), body,
      ld: [
        ld({ '@type': 'WebSite', name: SITE.name, url: abs('/'), description: SITE.desc, inLanguage: 'ko-KR' }),
        ld({ '@type': 'Organization', name: SITE.name, url: abs('/'), description: SITE.desc }),
        ld(itemList(top.slice(0, 10), `${SITE.name} 실시간 BEST 랭킹`)),
        faqLd()
      ]
    };
  }
  if (r.t === 'all') {
    return {
      title: `전체 상품 인기 랭킹 | ${SITE.name}`,
      desc: `${SITE.tagline} 전체 랭킹입니다. ${SITE.refresh} 쿠팡 판매 데이터를 기준으로 자동 갱신합니다`,
      canonical: abs('/all'),
      body: `<section class="ssr"><h1>전체 상품 인기 랭킹</h1><p>${esc(SITE.intro)}</p>${nav()}${li(list.slice(0, 40))}</section>`,
      ld: [crumbs([['홈', '/'], ['전체 상품', '/all']]), ld(itemList(top, `${SITE.name} 전체 상품 랭킹`))]
    };
  }
  const l = list.filter(p => p.category === r.c);
  const cfg = SITE.cats[r.c];
  return {
    title: `${r.c} 인기 랭킹 TOP | ${SITE.name}`, desc: cfg.intro, canonical: abs(catUrl(r.c)),
    body: `<section class="ssr"><h1>${esc(r.c)} 인기 랭킹</h1><p>${esc(cfg.intro)}</p>${nav()}${li(l.slice(0, 40))}</section>`,
    ld: [
      crumbs([['홈', '/'], [r.c, catUrl(r.c)]]),
      ld({ '@type': 'CollectionPage', name: `${r.c} 인기 랭킹`, url: abs(catUrl(r.c)), description: cfg.intro, inLanguage: 'ko-KR' }),
      ld(itemList(l.slice(0, 20), `${SITE.name} ${r.c} 인기 랭킹`))
    ]
  };
}

function inject(html, pg, img, boot) {
  const tags = [
    '<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">',
    `<link rel="canonical" href="${pg.canonical}">`,
    pg.preload ? `<link rel="preload" as="image" href="${pg.preload}" fetchpriority="high" referrerpolicy="no-referrer">` : '',
    `<meta property="og:type" content="website"><meta property="og:locale" content="ko_KR">`,
    `<meta property="og:site_name" content="${esc(SITE.name)}">`,
    `<meta property="og:title" content="${esc(pg.title)}"><meta property="og:description" content="${esc(pg.desc)}">`,
    `<meta property="og:url" content="${pg.canonical}">`,
    img ? `<meta property="og:image" content="${esc(img)}">` : '',
    `<meta name="twitter:card" content="${img ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${esc(pg.title)}"><meta name="twitter:description" content="${esc(pg.desc)}">`,
    img ? `<meta name="twitter:image" content="${esc(img)}">` : '',
    `<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E${encodeURIComponent(SITE.icon)}%3C/text%3E%3C/svg%3E">`,
    `<link rel="alternate" type="text/plain" href="/llms.txt" title="LLM site summary">`,
    ...pg.ld
  ].filter(Boolean).join('\n');
  return html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(pg.title)}</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(pg.desc)}">`)
    .replace('<link rel="stylesheet" href="/style.css">', m => m + (boot ? `\n<script>window.__p=${JSON.stringify(boot).replace(/</g, '\\u003c')}</script>` : ''))
    .replace('</head>', tags + '\n</head>')
    .replace(/<main id="view" class="wrap">[\s\S]*?<\/main>/, () => `<main id="view" class="wrap">${pg.body}</main>`)
    .replace('</body>', () => `<script type="application/json" id="faq-data">${JSON.stringify(SITE.faq).replace(/</g, '\\u003c')}</script>\n</body>`);
}

const headers = (type, ttl = 600) => ({ 'content-type': type, 'cache-control': `public,max-age=300,s-maxage=${ttl}` });

function robots() {
  const bots = ['*', 'Googlebot', 'Googlebot-Image', 'Bingbot', 'Yeti', 'Daumoa', 'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-User', 'Claude-SearchBot', 'anthropic-ai', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot', 'Applebot-Extended', 'Meta-ExternalAgent', 'Amazonbot', 'DuckAssistBot', 'CCBot'];
  const txt = bots.map(b => `User-agent: ${b}\nAllow: /\nDisallow: /0\nDisallow: /api/\n`).join('\n') + `\nSitemap: ${abs('/sitemap.xml')}\n`;
  return new Response(txt, { headers: headers('text/plain;charset=utf-8', 3600) });
}

async function sitemap(env) {
  const d = await load(env);
  const last = d && d.updatedAt ? String(d.updatedAt).slice(0, 10) : new Date().toISOString().slice(0, 10);
  const urls = [['/', 1.0], ['/all', 0.8], ...Object.keys(SITE.cats).map(c => [catUrl(c), 0.7]), ...((d && d.products) || []).slice(0, 400).map(x => ['/item/' + x.id, 0.6])];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([u, p]) => `<url><loc>${esc(abs(u))}</loc><lastmod>${last}</lastmod><changefreq>daily</changefreq><priority>${p}</priority></url>`).join('\n')}\n</urlset>\n`;
  return new Response(xml, { headers: headers('application/xml;charset=utf-8') });
}

async function llms(env) {
  const d = await load(env);
  const list = (d && d.products) || [];
  let t = `# ${SITE.name}\n\n> ${SITE.desc}\n\n${SITE.intro}\n\n## 주요 페이지\n\n- [홈](${abs('/')}): ${SITE.tagline} 실시간 BEST 랭킹\n- [전체 상품](${abs('/all')}): 전체 랭킹\n`;
  for (const [c, cfg] of Object.entries(SITE.cats)) t += `- [${c}](${abs(catUrl(c))}): ${cfg.intro}\n`;
  t += `\n## 자주 묻는 질문\n\n${SITE.faq.map(f => `### ${f.q}\n${f.a}\n`).join('\n')}`;
  if (list.length) t += `\n## 현재 인기 상품\n\n${list.slice(0, 10).map((p, i) => `${i + 1}. ${p.name} (${won(p.price)})`).join('\n')}\n`;
  t += `\n## 안내\n\n- ${DISC}\n- 상품 판매와 배송은 쿠팡에서 직접 처리하며 가격과 재고는 수시로 바뀝니다\n- 사이트맵: ${abs('/sitemap.xml')}\n`;
  return new Response(t, { headers: headers('text/plain;charset=utf-8') });
}

export async function seo(req, env, url, ctx, h = {}) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return null;
  try {
    const p = url.pathname;
    if (p === '/robots.txt') return robots();
    if (p === '/sitemap.xml') return await sitemap(env);
    if (p === '/llms.txt') return await llms(env);
    const r = route(p);
    if (!r) return null;
    const cache = caches.default;
    const key = new Request(url.origin + url.pathname);
    if (req.method === 'GET') { const hit = await cache.match(key); if (hit) return hit; }
    const tpl = await env.ASSETS.fetch(new Request(new URL('/', url)));
    if (!tpl.ok) return null;
    const d = h.products ? await h.products(env) : await load(env);
    let clicks = {};
    try { if (h.clicks) clicks = await h.clicks(); } catch (e) {}
    const list = (d && d.products) || [];
    if (r.t === 'item') {
      r.p = list.find(x => x.id === r.id);
      if (!r.p) return null;
      try { r.hist = h.hist ? await h.hist(r.id) : []; } catch (e) { r.hist = []; }
    }
    const pg = build(r, list);
    if (r.t === 'item' && r.p.image) pg.preload = r.p.image;
    const first = list.find(x => x.image);
    if (r.t === 'home') { // 첫 화면 대표 이미지는 미리 받기 시작한다 (클릭 순위가 앱과 같은 방식)
      const hero = list.map((p, i) => ({ p, i })).sort((x, y) => (clicks[y.p.id] || 0) - (clicks[x.p.id] || 0) || x.i - y.i).map(x => x.p).find(p => p.image);
      if (hero) pg.preload = hero.image;
    }
    const boot = d ? [{ ...d, products: list.map(({ rocket, ...x }) => x) }, clicks] : null; // 첫 화면에 필요한 데이터를 HTML에 함께 보낸다
    const html = inject(await tpl.text(), pg, (r.t === 'item' ? (r.p.image || '') : first ? first.image : ''), boot);
    const res = new Response(req.method === 'HEAD' ? null : html, { headers: { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'public,max-age=60,s-maxage=600' } });
    if (req.method === 'GET' && ctx) ctx.waitUntil(cache.put(key, res.clone()));
    return res;
  } catch (e) {
    return null;
  }
}
