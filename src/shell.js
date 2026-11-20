// 공통 화면 틀(public/index.html)의 빈칸을 사이트 설정으로 채운다 — 이름과 문구와 색상과 분야 목록이 여기서 들어간다
import { DISC, PROMOS } from '../sites/index.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const js = o => JSON.stringify(o).replace(/</g, '\\u003c');

// 사이트 로고 그림 (색은 사이트 색을 따른다)
export function logoSvg(site, c1, c2) {
  const g = (site.logo || '').replace(/\{c1\}/g, c1).replace(/\{c2\}/g, c2);
  return `<svg class="mk" viewBox="0 0 32 32" aria-hidden="true">${g}</svg>`;
}

export function themeCss(t) {
  const X = t.extra ? `@media(prefers-color-scheme:light){${t.extra}}` : ''; // 사이트별 추가 꾸밈 (밝은 화면에서만)
  const L = t.light, D = t.dark, T = t.tiles;
  const vars = o => Object.entries(o).filter(([, v]) => v).map(([k, v]) => `--${k}:${v}`).join(';');
  return `:root{${vars(L)};--grad:linear-gradient(135deg,var(--p1),var(--p2))}`
    + `@media(prefers-color-scheme:dark){:root{${vars(D)}}}`
    + `.t1{background:${T.t1.bg};color:${T.t1.ink}}.t2{background:${T.t2.bg};color:${T.t2.ink}}`
    + `@media(prefers-color-scheme:dark){.t1{background:${T.t1.dbg || T.t1.bg};color:${T.t1.dink || T.t1.ink}}.t2{background:${T.t2.dbg || T.t2.bg};color:${T.t2.dink || T.t2.ink}}}` + X;
}

// 브라우저 쪽 코드(app.js)가 쓰는 사이트 정보
export function clientSite(site) {
  return {
    id: site.id, name: site.name, empty: site.emptyIcon, heroEmpty: site.heroEmpty, tiles: site.tiles,
    cats: Object.keys(site.cats), guides: Object.keys(site.guides || {}), icons: Object.fromEntries(Object.entries(site.cats).map(([c, v]) => [c, v.icon]))
  };
}

export function renderShell(site, html) {
  const hostName = new URL(site.host).hostname;
  const promos = PROMOS.filter(p => p.site !== site.id).map(p => [p.id, p.text, p.url]);
  const map = {
    TITLE: esc(site.title), DESC: esc(site.desc), THEME_COLOR: esc(site.theme.color),
    NAME: esc(site.name), MARK: logoSvg(site, 'var(--p1)', 'var(--p2)'), TOPBAR: esc(site.topbar), SEARCH: esc(site.searchPlaceholder),
    DISC: esc(DISC), DISC_TOP: esc(DISC.replace(/^이 포스팅은 /, "").replace(/제공받습니다\.$/, "제공 받을 수도 있습니다.")), HOSTNAME: esc(hostName),
    THEME_CSS: themeCss(site.theme), SITE_JSON: js(clientSite(site)), PROMOS: js(promos)
  };
  return html.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => (k in map ? map[k] : m));
}

// 정적 파일 응답이 HTML이면 사이트 설정으로 채워서 돌려준다 (그 밖의 파일은 그대로)
export async function shellResponse(site, res) {
  const type = res.headers.get('content-type') || '';
  if (!res.ok || !type.includes('text/html')) return res;
  const headers = new Headers(res.headers);
  headers.delete('content-length');
  headers.delete('etag');
  return new Response(renderShell(site, await res.text()), { status: res.status, headers });
}
