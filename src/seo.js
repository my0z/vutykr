// SEO와 AEO 공용 모듈: 메타태그 JSON-LD 서버 렌더링 sitemap robots llms.txt
import { DISC } from '../sites/index.js';
import { indexNowKey } from './indexnow.js';
import { legalPage } from './legal.js';

// 사이트 설정을 받아 그 사이트의 서버 렌더링과 sitemap과 robots와 llms.txt를 만든다
export function createSeo(SITE) {
const GUIDE = Object.fromEntries(Object.entries(SITE.cats).map(([c, v]) => [c, v.tips]));

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ld = o => `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', ...o }).replace(/</g, '\\u003c')}</script>`;
const abs = p => (/^https?:/.test(p) ? p : SITE.host + p);
const won = n => (n ? `${n}원` : '가격 확인');
const catUrl = c => `/c/${encodeURIComponent(c)}`;

let cache = { t: 0, v: null };
async function load(env) {
  if (Date.now() - cache.t < 60000) return cache.v;
  let v = null;
  try { v = JSON.parse((await env.DATA.get('products', { cacheTtl: 60 })) || 'null'); } catch (e) {}
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
const faqLd = (faq = SITE.faq) => ld({
  '@type': 'FAQPage',
  mainEntity: faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }))
});
// 검색엔진용 목록은 상품 본문 페이지로 잇는다 (방문자가 보는 화면의 상품 링크는 쿠팡으로 바로 간다)
const li = list => `<ul>${list.map(p => `<li><a href="/item/${esc(p.id)}">${esc(p.name)}</a> ${won(p.price)}</li>`).join('')}</ul>`;
const faqHtml = (faq = SITE.faq) => `<section class="faq"><h2>자주 묻는 질문</h2>${faq.map(f => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</section>`;
// 분야마다 질문과 답을 만든다 (검색엔진과 AI 답변이 그대로 가져갈 수 있게 짧고 분명한 문장으로 쓴다)
const catFaq = c => {
  const cfg = SITE.cats[c];
  return [
    { q: `${c} 고를 때 무엇을 확인하나요`, a: (cfg.tips || []).join(' ') },
    { q: `${c} 인기 순위는 어떻게 정하나요`, a: `쿠팡의 판매 데이터와 인기 순위를 기준으로 상품을 모아 ${SITE.refresh} 같은 상품은 중복 없이 한 번만 보여 드립니다.` },
    { q: `${c} 가격은 실시간인가요`, a: '쿠팡 기준으로 주기적으로 갱신되며 실제 가격과 재고는 쿠팡에서 바뀔 수 있으니 구매 전에 꼭 확인하세요.' },
    { q: `${c} 상품은 어디서 구매하나요`, a: `상품을 누르면 안내 페이지를 거쳐 쿠팡으로 이동하며 구매와 배송과 교환과 환불은 쿠팡에서 직접 처리합니다. ${SITE.name} 사이트는 상품을 소개만 하는 사이트입니다.` }
  ];
};
const nav = () => `<nav><a href="/">홈</a> <a href="/all">전체 상품</a> ${Object.keys(SITE.cats).map(c => `<a href="${catUrl(c)}">${esc(c)}</a>`).join(' ')}</nav>`;

const guideUrl = c => '/guide/' + encodeURIComponent(c);
const hasGuide = c => !!(SITE.guides && SITE.guides[c]);

function route(p) {
  if (p === '/' || p === '/index.html') return { t: 'home' };
  if (p === '/about' || p === '/privacy' || p === '/terms') return { t: 'legal', k: p.slice(1) };
  if (p === '/all') return { t: 'all' };
  const im = p.match(/^\/item\/(\d{1,20})$/);
  if (im) return { t: 'item', id: im[1] };
  const gm = p.match(/^\/guide\/(.+)$/);
  if (gm) {
    let c = '';
    try { c = decodeURIComponent(gm[1]); } catch (e) { return null; }
    if (hasGuide(c)) return { t: 'guide', c };
  }
  const m = p.match(/^\/c\/(.+)$/);
  if (m) {
    let c = '';
    try { c = decodeURIComponent(m[1]); } catch (e) { return null; }
    if (SITE.cats[c]) return { t: 'cat', c };
  }
  return null;
}


const NF = new Intl.NumberFormat('ko-KR');
const fmt = n => NF.format(Number(n));
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

// 스레드 공유 창 주소: 상품명과 가격과 이 페이지 주소와 대가성 문구를 글 내용으로 채워 준다 (500자 제한 안쪽)
const shareUrl = p => 'https://www.threads.net/intent/post?text=' + encodeURIComponent(`${String(p.name).slice(0, 100)}${p.price ? ' ' + p.price + '원' : ''}\n${abs('/item/' + p.id)}\n\n${DISC}`);

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
  else trend = '<p>이 상품의 가격 기록을 쌓는 중입니다. 쿠팡 파트너스 데이터를 불러올 때 가격이 바뀐 것이 확인되면 이곳에 표시합니다.</p>';
  const facts = [
    ['카테고리', cat],
    ['쿠팡 판매가', p.price ? `${fmt(p.price)}원` : '쿠팡에서 확인'],
    unit ? ['단위 가격', unit + ' 상품명의 용량 기준 추정'] : null,
    idx >= 0 ? ['같은 카테고리 가격 순위', `${byPrice.length}개 중 ${idx + 1}번째로 저렴 (이 사이트에 담긴 상품 기준)`] : null
  ].filter(Boolean);
  const title = `${p.name} 가격 정보 | ${SITE.name}`;
  const desc = `${p.name} ${cat} 상품의 쿠팡 판매가${p.price ? ' ' + p.price + '원' : ''}과 가격 변화와 같은 카테고리 가격 비교와 고르는 법을 정리했습니다`.slice(0, 150);
  const tip = (GUIDE[cat] || []).map(t => `<li>${esc(t)}</li>`).join('');
  const faq = [
    p.price ? { q: `${p.name} 가격은 얼마인가요`, a: `쿠팡 판매가는 ${fmt(p.price)}원으로 확인됩니다. 가격과 재고는 수시로 바뀌니 구매 전에 쿠팡에서 다시 확인하세요.` } : null,
    { q: `${p.name} 어디서 구매하나요`, a: `쿠팡에서 구매합니다. 이 페이지의 버튼을 누르면 쿠팡으로 연결되며 구매와 배송과 교환과 환불은 쿠팡에서 직접 처리합니다. ${SITE.name} 사이트는 상품을 소개만 하는 사이트입니다.` },
    { q: `${p.name}은 ${cat} 중 어떤 상품인가요`, a: `${cat} 분야에서 쿠팡 인기 기준으로 모은 상품입니다. ${(SITE.cats[cat] && SITE.cats[cat].intro) || ''}` }
  ].filter(Boolean);
  const body = `<article class="ip ssr" data-cat="${esc(cat)}">
<nav class="crumb"><a href="/">홈</a> › <a href="${catUrl(cat)}">${esc(cat)}</a> › <span>상품 정보</span></nav>
<div class="ip-top"><div class="ip-img">${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" fetchpriority="high" decoding="async" referrerpolicy="no-referrer">` : `<span>${SITE.emptyIcon}</span>`}</div>
<div class="ip-info"><span class="bd">${esc(cat)}</span><h1>${esc(p.name)}</h1>
<div class="ip-price">${p.price ? `${fmt(p.price)}<small>원</small>` : '가격 확인'}</div>
<p class="ip-note">쿠팡 파트너스 데이터 기준이며 실제 가격과 재고는 쿠팡에서 바뀔 수 있습니다.</p>
<a class="ip-cta" href="${esc(p.url)}" target="_blank" rel="sponsored nofollow noopener">쿠팡에서 최신 가격 확인하기</a>
<a class="ip-share" href="${esc(shareUrl(p))}" target="_blank" rel="noopener nofollow">스레드에 올리기</a>
</div></div>
<section><h2>상품 한눈에 보기</h2><table class="ip-table"><tbody>${facts.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table></section>
<section><h2>가격 변화</h2>${spark(hist)}${trend}<p class="ip-note">쿠팡 파트너스 데이터를 불러온 시점의 가격이 바뀐 경우만 기록한 값이며 상품마다 불러오는 시점이 다릅니다.</p></section>
<section><h2>${esc(cat)} 가격 비교</h2><table class="ip-table cmp"><thead><tr><th>상품</th><th>쿠팡 판매가</th></tr></thead><tbody>${near.map(x => `<tr class="${x.id === p.id ? 'me' : ''}"><td><a href="/item/${esc(x.id)}">${esc(x.name)}</a></td><td>${fmt(x.price)}원</td></tr>`).join('')}</tbody></table></section>
${tip ? `<section><h2>${esc(cat)} 고를 때 확인할 점</h2><ul class="ip-tips">${tip}</ul></section>` : ''}
${similar.length ? `<section><h2>같은 카테고리의 다른 상품</h2><div class="ip-sim">${similar.map(x => `<a href="/item/${esc(x.id)}">${x.image ? `<img src="${esc(x.image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : `<span>${SITE.emptyIcon}</span>`}<b>${esc(x.name)}</b><em>${x.price ? fmt(x.price) + '원' : ''}</em></a>`).join('')}</div></section>` : ''}
</article>${faqHtml(faq)}`;
  return {
    title, desc, canonical: abs('/item/' + p.id), body,
    ld: [
      crumbs([['홈', '/'], [cat, catUrl(cat)], [p.name, '/item/' + p.id]]),
      ld({ ...product(p), '@id': abs('/item/' + p.id), url: abs('/item/' + p.id), description: desc, offers: p.price ? { '@type': 'Offer', priceCurrency: 'KRW', price: p.price, url: abs(p.url) } : undefined }),
      faqLd(faq)
    ]
  };
}

function buildGuide(c, list) {
  const g = SITE.guides[c];
  const items = list.filter(p => p.category === c).slice(0, 5);
  const title = `${c} 구매 가이드 | ${SITE.name}`;
  const desc = g.lead.slice(0, 150);
  const body = `<article class="ip gd ssr" data-cat="${esc(c)}">
<nav class="crumb"><a href="/">홈</a> › <a href="${catUrl(c)}">${esc(c)}</a> › <span>구매 가이드</span></nav>
<section><h1>${esc(c)} 구매 가이드</h1><p>${esc(g.lead)}</p></section>
${g.sections.map(([h, t]) => `<section><h2>${esc(h)}</h2><p>${esc(t)}</p></section>`).join('')}
<section><h2>구매 전 체크리스트</h2><ul class="ip-tips">${g.check.map(x => `<li>${esc(x)}</li>`).join('')}</ul></section>
${items.length ? `<section><h2>${esc(c)} 인기 상품</h2><ul class="ip-tips">${items.map(p => `<li><a href="${esc(p.url)}" target="_blank" rel="sponsored nofollow noopener">${esc(p.name)}</a> ${won(p.price)}</li>`).join('')}</ul></section>` : ''}
<p class="ip-note"><a href="${catUrl(c)}">${esc(c)} 인기 랭킹 전체 보기</a> 가격과 재고는 쿠팡에서 바뀔 수 있습니다. ${esc(SITE.name)} 사이트는 상품을 소개만 하는 사이트이며 판매 당사자가 아닙니다.</p>
</article>${faqHtml(catFaq(c))}`;
  const img = (items.find(p => p.image) || {}).image;
  return {
    title, desc, canonical: abs(guideUrl(c)), body,
    ld: [
      crumbs([['홈', '/'], [c, catUrl(c)], ['구매 가이드', guideUrl(c)]]),
      ld({ '@type': 'Article', headline: `${c} 구매 가이드`, description: desc, inLanguage: 'ko-KR', datePublished: '2026-11-19', dateModified: '2026-11-19', image: img || undefined, author: { '@type': 'Organization', name: SITE.name }, publisher: { '@type': 'Organization', name: SITE.name }, mainEntityOfPage: abs(guideUrl(c)) }),
      faqLd(catFaq(c))
    ]
  };
}

function build(r, list) {
  if (r.t === 'item') return buildItem(r.p, list, r.hist || []);
  if (r.t === 'guide') return buildGuide(r.c, list);
  if (r.t === 'legal') { const g = legalPage(SITE, r.k); return { title: g.title, desc: g.desc, canonical: abs('/' + r.k), body: g.body, ld: [crumbs([['홈', '/'], [g.title.split(' | ')[0], '/' + r.k]])] }; }
  const top = list.slice(0, 20);
  if (r.t === 'home') {
    let body = `<section class="ssr"><h1>${esc(SITE.h1)}</h1><p>${esc(SITE.intro)}</p>${nav()}`;
    body += `<h2>실시간 BEST 랭킹</h2>${li(top.slice(0, 10))}`;
    for (const c of Object.keys(SITE.cats)) {
      const l = list.filter(p => p.category === c).slice(0, 5);
      if (l.length) body += `<h2><a href="${catUrl(c)}">${esc(c)} 인기 랭킹</a></h2>${li(l)}`;
    }
    if (SITE.guides) body += `<h2>분야별 구매 가이드</h2><ul>${Object.keys(SITE.guides).map(c => `<li><a href="${guideUrl(c)}">${esc(c)} 구매 가이드</a></li>`).join('')}</ul>`;
    body += `</section>${faqHtml()}`;
    return {
      home: true, title: SITE.title, desc: SITE.desc, canonical: abs('/'), body,
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
    body: `<section class="ssr"><h1>${esc(r.c)} 인기 랭킹</h1><p>${esc(cfg.intro)}</p>${nav()}${li(l.slice(0, 40))}${hasGuide(r.c) ? `<p><a href="${guideUrl(r.c)}">${esc(r.c)} 구매 가이드 보기</a></p>` : ''}<h2>${esc(r.c)} 고를 때 확인할 점</h2><ul>${(cfg.tips || []).map(t => `<li>${esc(t)}</li>`).join('')}</ul></section>${faqHtml(catFaq(r.c))}`,
    ld: [
      crumbs([['홈', '/'], [r.c, catUrl(r.c)]]),
      ld({ '@type': 'CollectionPage', name: `${r.c} 인기 랭킹`, url: abs(catUrl(r.c)), description: cfg.intro, inLanguage: 'ko-KR' }),
      ld(itemList(l.slice(0, 20), `${SITE.name} ${r.c} 인기 랭킹`)),
      faqLd(catFaq(r.c))
    ]
  };
}

// 메인 배너 상품은 방문마다 무작위라서 서버가 미리 받게 할 수 없다.
// 데이터가 HTML에 들어 있으니 스크립트보다 먼저 같은 규칙으로 첫 배너 상품을 뽑아 이미지를 바로 받기 시작한다 (app.js가 같은 상품을 쓴다).
const HERO_JS = `(function(){try{var d=window.__p[0].products,c=window.__p[1]||{},u={},n=0,k=function(p){return 'n:'+String(p.name).toLowerCase().replace(/\\s+/g,'')};
var r=d.map(function(p,i){return{p:p,i:i}}).sort(function(a,b){return(c[b.p.id]||0)-(c[a.p.id]||0)||a.i-b.i}).map(function(x){return x.p});
for(var i=0;i<r.length&&n<12;i++){var p=r[i];if(u[p.id]||u[k(p)])continue;u[p.id]=u[k(p)]=1;n++}
var e=r.filter(function(p){return p.image&&!u[p.id]&&!u[k(p)]});if(!e.length)return;var h=e[Math.floor(Math.random()*e.length)];window.__h=h.id;
var s=String(h.image).replace(/^http:/,'https:').replace(/^https:\\/\\/(?:image\\d+|img\\d+[a-z]?|static)\\.coupangcdn\\.com(\\/image\\/)/,'https://image1.coupangcdn.com$1');
var l=document.createElement('link');l.rel='preload';l.as='image';l.href=s;l.setAttribute('fetchpriority','high');l.referrerPolicy='no-referrer';document.head.appendChild(l)}catch(e){}})();`;

function inject(html, pg, img, boot) {
  const tags = [
    '<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">',
    SITE.verify && SITE.verify.naver ? `<meta name="naver-site-verification" content="${esc(SITE.verify.naver)}">` : '',
    SITE.verify && SITE.verify.google ? `<meta name="google-site-verification" content="${esc(SITE.verify.google)}">` : '',
    SITE.verify && SITE.verify.bing ? `<meta name="msvalidate.01" content="${esc(SITE.verify.bing)}">` : '',
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
    `<link rel="icon" type="image/svg+xml" href="/favicon.svg">`,
    `<link rel="alternate" type="text/plain" href="/llms.txt" title="LLM site summary">`,
    ...pg.ld
  ].filter(Boolean).join('\n');
  return html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(pg.title)}</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(pg.desc)}">`)
    .replace(/<link rel="stylesheet" href="\/style\.css[^"]*">/, m => m + (boot ? `\n<script>window.__p=${JSON.stringify(boot).replace(/</g, '\\u003c')}</script>` + (pg.home ? `\n<script>${HERO_JS}</script>` : '') : ''))
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
  const urls = [['/', 1.0], ['/all', 0.8], ...Object.keys(SITE.cats).map(c => [catUrl(c), 0.7]), ...Object.keys(SITE.guides || {}).map(c => [guideUrl(c), 0.8]), ['/about', 0.3], ['/privacy', 0.2], ['/terms', 0.2], ...((d && d.products) || []).slice(0, 2000).map(x => ['/item/' + x.id, 0.6])];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([u, p]) => `<url><loc>${esc(abs(u))}</loc><lastmod>${last}</lastmod><changefreq>daily</changefreq><priority>${p}</priority></url>`).join('\n')}\n</urlset>\n`;
  return new Response(xml, { headers: headers('application/xml;charset=utf-8') });
}

async function llms(env) {
  const d = await load(env);
  const list = (d && d.products) || [];
  let t = `# ${SITE.name}\n\n> ${SITE.desc}\n\n${SITE.intro}\n\n## 주요 페이지\n\n- [홈](${abs('/')}): ${SITE.tagline} 실시간 BEST 랭킹\n- [전체 상품](${abs('/all')}): 전체 랭킹\n`;
  for (const [c, cfg] of Object.entries(SITE.cats)) t += `- [${c}](${abs(catUrl(c))}): ${cfg.intro}\n`;
  if (SITE.guides) t += `\n## 구매 가이드\n\n${Object.keys(SITE.guides).map(c => `- [${c} 구매 가이드](${abs(guideUrl(c))}): ${SITE.guides[c].lead}`).join('\n')}\n`;
  t += `\n## 자주 묻는 질문\n\n${SITE.faq.map(f => `### ${f.q}\n${f.a}\n`).join('\n')}`;
  if (list.length) t += `\n## 현재 인기 상품\n\n${list.slice(0, 10).map((p, i) => `${i + 1}. ${p.name} (${won(p.price)})`).join('\n')}\n`;
  t += `\n## 안내\n\n- ${DISC}\n- 상품 판매와 배송은 쿠팡에서 직접 처리하며 가격과 재고는 수시로 바뀝니다\n- 사이트맵: ${abs('/sitemap.xml')}\n`;
  return new Response(t, { headers: headers('text/plain;charset=utf-8') });
}

// 사이트 전체 내용을 한 문서로 (AI 검색이 한 번에 읽도록)
async function llmsFull(env) {
  const d = await load(env);
  const list = (d && d.products) || [];
  let t = `# ${SITE.name} 전체 안내\n\n> ${SITE.desc}\n\n${SITE.intro}\n\n`;
  for (const [c, cfg] of Object.entries(SITE.cats)) {
    t += `## ${c}\n\n${cfg.intro}\n\n주소: ${abs(catUrl(c))}\n\n고를 때 확인할 점\n${(cfg.tips || []).map(x => `- ${x}`).join('\n')}\n\n${hasGuide(c) ? `구매 가이드 (${abs(guideUrl(c))})\n${SITE.guides[c].lead}\n${SITE.guides[c].sections.map(([h, x]) => `- ${h}: ${x}`).join('\n')}\n체크리스트: ${SITE.guides[c].check.join(' / ')}\n\n` : ''}`;
    const l = list.filter(p => p.category === c).slice(0, 10);
    if (l.length) t += `현재 인기 상품\n${l.map((p, i) => `${i + 1}. ${p.name} (${won(p.price)}) ${abs('/item/' + p.id)}`).join('\n')}\n\n`;
  }
  t += `## 자주 묻는 질문\n\n${SITE.faq.map(f => `### ${f.q}\n${f.a}\n`).join('\n')}\n## 안내\n\n- ${DISC}\n- 상품 판매와 배송은 쿠팡에서 직접 처리하며 가격과 재고는 수시로 바뀝니다\n`;
  return new Response(t, { headers: headers('text/plain;charset=utf-8') });
}

const busy = new Set();
// 탭 아이콘은 사이트 로고를 그대로 쓴다
  function favicon() {
    const c = SITE.theme.light;
    const g = (SITE.logo || '').replace(/\{c1\}/g, c.p1).replace(/\{c2\}/g, c.p2);
    return new Response(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${g}</svg>`, { headers: { 'content-type': 'image/svg+xml', 'cache-control': 'public,max-age=86400' } });
  }

async function seo(req, env, url, ctx, h = {}) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return null;
  try {
    const p = url.pathname;
    if (p === '/favicon.svg') return favicon();
    if (p === '/robots.txt') return robots();
    if (p === '/sitemap.xml') return await sitemap(env);
    if (p === '/llms.txt') return await llms(env);
    if (p === '/llms-full.txt') return await llmsFull(env);
    if (/^\/[0-9a-f]{32}\.txt$/.test(p) && p === `/${await indexNowKey(SITE)}.txt`) return new Response(p.slice(1, 33), { headers: { 'content-type': 'text/plain;charset=utf-8', 'cache-control': 'public,max-age=86400' } });
    const r = route(p);
    if (!r) return null;
    const cache = caches.default;
    const key = new Request(url.origin + url.pathname + '?v=45&s=' + SITE.id);
    let miss = false; // 상품 목록은 읽었는데 이 상품만 없을 때
    const gone = () => new Response('<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>상품이 목록에서 빠졌어요</title><body style="font-family:sans-serif;padding:40px;line-height:1.7"><h1>이 상품은 더 이상 목록에 없어요</h1><p>판매가 끝났거나 인기 목록에서 빠진 상품입니다.</p><p><a href="/all">전체 상품 보기</a></p>', { status: 410, headers: { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'public,max-age=3600', 'x-robots-tag': 'noindex' } });
    const gen = async () => {
      const t0 = Date.now();
      // 템플릿과 상품과 클릭과 가격 기록을 동시에 읽는다
      const [tpl, d, clicks, hist] = await Promise.all([
        env.ASSETS.fetch(new Request(new URL('/', url))),
        h.products ? h.products(env) : load(env),
        h.clicks ? h.clicks().catch(() => ({})) : {},
        r.t === 'item' && h.hist ? h.hist(r.id).catch(() => []) : []
      ]);
      if (!tpl.ok) return null;
      const list = (d && d.products) || [];
      const rr = { ...r };
      if (r.t === 'item') {
        rr.p = list.find(x => x.id === r.id);
        if (!rr.p) { miss = list.length > 0; return null; }
        rr.hist = hist;
      }
      const pg = build(rr, list);
      if (rr.t === 'item' && rr.p.image) pg.preload = rr.p.image;
      const first = list.find(x => x.image);
      // 상품 본문 페이지는 상품 목록이 필요 없어서 비워 용량을 줄인다
      const boot = d ? [rr.t === 'item' ? { updatedAt: d.updatedAt, categories: d.categories, meta: d.meta, products: [] } : { ...d, products: list.map(({ rocket, ...x }) => x) }, clicks] : null;
      const html = inject(await tpl.text(), pg, (rr.t === 'item' ? (rr.p.image || '') : first ? first.image : ''), boot);
      // 브라우저에는 1분 엣지에는 하루 보관하고 5분이 지나면 보여 주면서 뒤에서 새로 만든다
      return new Response(html, { headers: { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'public,max-age=60,s-maxage=86400', 'x-gen': String(Date.now()), 'server-timing': `gen;dur=${Date.now() - t0}` } });
    };
    if (req.method === 'GET') {
      const hit = await cache.match(key);
      if (hit) {
        const age = Date.now() - Number(hit.headers.get('x-gen') || 0);
        if (age > 300000 && ctx && !busy.has(key.url)) {
          busy.add(key.url);
          ctx.waitUntil((async () => { try { const n = await gen(); if (n) await cache.put(key, n); else if (miss) await cache.delete(key); } catch (e) {} finally { busy.delete(key.url); } })());
        }
        return hit;
      }
    }
    const res = await gen();
    if (!res) return miss ? gone() : null;
    if (req.method === 'GET' && ctx) ctx.waitUntil(cache.put(key, res.clone()));
    return req.method === 'HEAD' ? new Response(null, res) : res;
  } catch (e) {
    return null;
  }
}

return { seo };
}
