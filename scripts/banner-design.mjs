// 배너 디자인 여러 가지 (배치와 색 조합과 단추 모양과 문구를 무작위로 섞는다)
const pick = a => a[Math.floor(Math.random() * a.length)];
const dark = (hex, k = 0.72) => '#' + hex.replace('#', '').match(/../g).map(h => Math.round(parseInt(h, 16) * k).toString(16).padStart(2, '0')).join('');

export const LAYOUTS = ['split', 'mirror', 'full', 'fullr', 'center', 'light', 'slant', 'glass', 'circle'];
// 상품(사진 주인공)이 놓이는 쪽. 사진 생성 문구와 AI 광고 표시 위치가 이걸 따른다 (left 면 표시를 오른쪽 아래로)
const SUBJ = { mirror: 'left', fullr: 'left', center: 'center' };
export const subjOf = l => SUBJ[l] || 'right';
const TITLES = [c => `${c} 인기 랭킹`, c => `${c} 모아보기`, c => `${c} 베스트 한눈에`, c => `지금 많이 찾는 ${c}`, c => `${c} 고르기 전에 확인`, c => `${c} 인기 상품 모음`];
const SUBS = [(k, n) => `${k} 베스트를 한눈에`, (k, n) => `${k} 가격 비교하고 고르기`, () => '쿠팡 인기 상품을 모아 보여 드려요', (k, n) => `${k} 구매 가이드와 함께`];
const BTNS = ['pill', 'solid', 'outline', 'square'];
const PALS = ['a', 'b', 'c'];

export function randomDesign(layout) {
  return { layout: layout || pick(LAYOUTS), pal: pick(PALS), btn: pick(BTNS), title: Math.floor(Math.random() * TITLES.length), sub: Math.floor(Math.random() * SUBS.length), flip: Math.random() < 0.5 };
}

export function copyOf(site, cat, d) {
  const k = site.cats[cat].kw.slice(0, 3).join(' · ');
  return { title: TITLES[d.title](cat), sub: SUBS[d.sub](k, site.name) };
}

export function buildHtml(site, cat, photoB64, narrow, d) {
  const L = site.theme.light, w = narrow ? 960 : 1920, h = narrow ? 300 : 240;
  const { title, sub } = copyOf(site, cat, d);
  const g = { a: [dark(L.p1), L.p1, L.p2], b: [L.p3, L.p1, L.p2], c: [dark(L.p1, 0.6), dark(L.p1, 0.85), L.p1] }[d.pal];
  const grad = `linear-gradient(100deg,${g[0]} 0%,${g[1]} 55%,${g[2]} 100%)`;
  const acc = dark(L.p1, 0.85), photo = `url(data:image/jpeg;base64,${photoB64})`;
  const ww = narrow ? 420 : 460;
  const fs = narrow ? 38 : 52, fs2 = narrow ? 21 : 28, pad = narrow ? 48 : 90;
  const btnBase = `font-weight:900;white-space:nowrap;font-size:${narrow ? 24 : 32}px;padding:${narrow ? '12px 34px' : '20px 52px'};`;
  const btnOn = { pill: `background:#fff;color:${acc};border-radius:99px;`, solid: `background:${acc};color:#fff;border-radius:99px;box-shadow:0 6px 18px rgba(0,0,0,.25);`, outline: `background:transparent;color:#fff;border:3px solid #fff;border-radius:99px;`, square: `background:#fff;color:${acc};border-radius:14px;` }[d.btn];
  const btnOnLight = { pill: `background:${acc};color:#fff;border-radius:99px;`, solid: `background:${L.p1};color:#fff;border-radius:99px;box-shadow:0 6px 18px rgba(0,0,0,.18);`, outline: `background:transparent;color:${acc};border:3px solid ${acc};border-radius:99px;`, square: `background:${acc};color:#fff;border-radius:14px;` }[d.btn];
  const tx = (color, left, top, btnStyle, align = 'left', maxw = 0) => `<div style="position:absolute;left:${left}px;top:${top}px;text-align:${align};color:${color}"><div style="display:inline-block;background:${color === '#fff' ? 'rgba(255,255,255,.22)' : L.soft};padding:6px 20px;border-radius:99px;font-weight:800;font-size:${narrow ? 20 : 22}px">${site.name}</div><div style="font-weight:900;font-size:${fs}px;line-height:1.15;margin-top:${narrow ? 12 : 8}px;letter-spacing:-.03em;${color === '#fff' ? 'text-shadow:0 2px 12px rgba(0,0,0,.3);' : ''}white-space:nowrap">${title}</div><div style="font-weight:500;font-size:${fs2}px;margin-top:${narrow ? 8 : 6}px;opacity:.95;white-space:nowrap;${maxw ? `max-width:${maxw}px;overflow:hidden;text-overflow:ellipsis;` : ''}">${sub}</div>${narrow ? `<div style="display:inline-block;margin-top:16px;${btnBase}${btnStyle}">${site.name} 가기 →</div>` : ''}</div>`;
  const cta = (left, style) => narrow ? '' : `<div style="position:absolute;left:${left}px;top:98px;${btnBase}${style}">${site.name} 가기 →</div>`;
  const wrap = (bg, inner) => `<html><body style="margin:0;width:${w}px;height:${h}px;overflow:hidden;font-family:'Noto Sans CJK KR','Noto Sans KR',sans-serif"><div style="position:relative;width:${w}px;height:${h}px;background:${bg};overflow:hidden">${inner}</div></body></html>`;
  const blob = c => `<div style="position:absolute;left:${narrow ? 300 : 650}px;top:${narrow ? -80 : -140}px;width:${narrow ? 440 : 540}px;height:${narrow ? 440 : 540}px;border-radius:50%;background:${c}"></div>`;
  const subj = subjOf(d.layout), px = d.px || { left: '30%', center: '50%', right: '70%' }[subj];
  const cover = (extra) => d.contain ? `background:${photo} 50% 50%/auto 100% no-repeat #f2f3f3;${extra}` : `background:${photo} ${px} 30%/cover no-repeat;${extra}`; // contain = 정사각형 상품 사진을 잘라내지 않고 통째로 보여 준다
  const ph = (side, mask) => `<div style="position:absolute;${side}:${narrow ? 0 : 20}px;top:0;width:${ww}px;height:${h}px;${cover(`-webkit-mask-image:${mask};mask-image:${mask};`)}"></div>`;
  switch (d.layout) {
    case 'fullr': return wrap('#111', `<div style="position:absolute;inset:0;${cover('')}"></div><div style="position:absolute;inset:0;background:linear-gradient(270deg,rgba(0,0,0,.72) 0%,rgba(0,0,0,.45) 45%,rgba(0,0,0,0) 100%)"></div>` + tx('#fff', narrow ? 470 : 740, narrow ? 40 : 32, btnOn, 'left', narrow ? 470 : 800) + cta(1580, btnOn));
    case 'center': if (!narrow) return wrap(grad, blob('rgba(255,255,255,.1)') + `<div style="position:absolute;left:730px;top:0;width:460px;height:${h}px;${cover('-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 25%,#000 75%,transparent 100%);mask-image:linear-gradient(90deg,transparent 0,#000 25%,#000 75%,transparent 100%);')}"></div>` + tx('#fff', pad, 32, btnOn) + cta(1450, btnOn));
      return wrap(grad, blob('rgba(255,255,255,.1)') + ph('right', 'linear-gradient(90deg,transparent 0,#000 30%)') + tx('#fff', pad, 40, btnOn));
    case 'mirror': return wrap(grad, blob('rgba(255,255,255,.1)') + ph('left', 'linear-gradient(270deg,transparent 0,#000 30%)') + tx('#fff', narrow ? 470 : 560, narrow ? 40 : 32, btnOn, 'left', narrow ? 470 : 880) + cta(1500, btnOn));
    case 'full': return wrap('#111', `<div style="position:absolute;inset:0;${cover('')}"></div><div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.72) 0%,rgba(0,0,0,.45) 55%,rgba(0,0,0,0) 100%)"></div>` + tx('#fff', pad, narrow ? 40 : 32, btnOn) + cta(1000, btnOn));
    case 'light': return wrap(`linear-gradient(100deg,#fff 0%,${L.soft} 60%,${g[2]}33 100%)`, `<div style="position:absolute;right:${narrow ? 30 : 60}px;top:${narrow ? 30 : 20}px;width:${narrow ? 400 : 420}px;height:${h - (narrow ? 60 : 40)}px;border-radius:28px;${cover('box-shadow:0 14px 34px rgba(0,0,0,.22);')}"></div>` + tx(L.ink, pad, narrow ? 40 : 32, btnOnLight, 'left', narrow ? 470 : 0) + cta(1000, btnOnLight));
    case 'slant': return wrap(grad, `<div style="position:absolute;right:0;top:0;width:${narrow ? 520 : 700}px;height:${h}px;${cover(`clip-path:polygon(${narrow ? 22 : 18}% 0,100% 0,100% 100%,0 100%);`)}"></div>` + tx('#fff', pad, narrow ? 40 : 32, btnOn) + cta(880, btnOn));
    case 'glass': return wrap('#111', `<div style="position:absolute;inset:0;${cover('')}"></div><div style="position:absolute;left:${narrow ? 28 : 50}px;top:${narrow ? 22 : 14}px;width:${narrow ? 640 : 1000}px;height:${h - (narrow ? 44 : 28)}px;border-radius:26px;background:rgba(10,10,20,.5);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1.5px solid rgba(255,255,255,.4)"></div>` + tx('#fff', narrow ? 62 : 90, narrow ? 36 : 26, btnOn) + cta(narrow ? 0 : 760, btnOn));
    case 'circle': { const dia = narrow ? 250 : 206; return wrap(`linear-gradient(100deg,${g[2]} 0%,${g[1]} 50%,${g[0]} 100%)`, blob('rgba(255,255,255,.12)') + `<div style="position:absolute;right:${narrow ? 50 : 110}px;top:${(h - dia) / 2}px;width:${dia}px;height:${dia}px;border-radius:50%;border:8px solid #fff;box-shadow:0 10px 30px rgba(0,0,0,.3);${cover('')}"></div>` + tx('#fff', pad, narrow ? 40 : 32, btnOn) + cta(1000, btnOn)); }
    default: return wrap(grad, blob('rgba(255,255,255,.1)') + ph('right', 'linear-gradient(90deg,transparent 0,#000 30%)') + tx('#fff', pad, narrow ? 40 : 32, btnOn) + cta(1000, btnOn));
  }
}
