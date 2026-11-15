// SEO와 AEO 공용 모듈: 메타태그 JSON-LD 서버 렌더링 sitemap robots llms.txt
import { SITE } from './site.js';

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
  if (p.image) o.image = abs('/i/' + p.id);
  if (p.price) o.offers = { '@type': 'Offer', priceCurrency: 'KRW', price: p.price, availability: 'https://schema.org/InStock', url: abs(p.url) };
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
  const m = p.match(/^\/c\/(.+)$/);
  if (m) {
    let c = '';
    try { c = decodeURIComponent(m[1]); } catch (e) { return null; }
    if (SITE.cats[c]) return { t: 'cat', c };
  }
  return null;
}

function build(r, list) {
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
    pg.preload ? `<link rel="preload" as="image" href="${pg.preload}" fetchpriority="high">` : '',
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
  const urls = [['/', 1.0], ['/all', 0.8], ...Object.keys(SITE.cats).map(c => [catUrl(c), 0.7])];
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
  t += `\n## 안내\n\n- 이 사이트는 쿠팡 파트너스 활동의 일환으로 수수료를 제공받을 수 있습니다\n- 상품 판매와 배송은 쿠팡에서 직접 처리하며 가격과 재고는 수시로 바뀝니다\n- 사이트맵: ${abs('/sitemap.xml')}\n`;
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
    const pg = build(r, list);
    const first = list.find(x => x.image);
    if (r.t === 'home') { // 첫 화면 대표 이미지는 미리 받기 시작한다 (클릭 순위가 앱과 같은 방식)
      const hero = list.map((p, i) => ({ p, i })).sort((x, y) => (clicks[y.p.id] || 0) - (clicks[x.p.id] || 0) || x.i - y.i).map(x => x.p).find(p => p.image);
      if (hero) pg.preload = '/i/' + hero.id;
    }
    const boot = d ? [{ ...d, products: list.map(p => ({ ...p, image: !!p.image })) }, clicks] : null; // 첫 화면에 필요한 데이터를 HTML에 함께 보낸다
    const html = inject(await tpl.text(), pg, first ? abs('/i/' + first.id) : '', boot);
    const res = new Response(req.method === 'HEAD' ? null : html, { headers: { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'public,max-age=60,s-maxage=600' } });
    if (req.method === 'GET' && ctx) ctx.waitUntil(cache.put(key, res.clone()));
    return res;
  } catch (e) {
    return null;
  }
}
