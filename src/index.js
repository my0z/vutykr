// 진입점: 방문한 주소로 어느 사이트인지 찾아 그 사이트의 설정과 저장소로 요청을 처리한다
import { SITES, DEFAULT_SITE, siteForHost, redirectForHost, AUTO_PROMOS } from '../sites/index.js';
import { createCommunity } from './community.js';
import { createAnalytics } from './analytics.js';
import { createSeo } from './seo.js';
import { createSite } from './engine.js';
import { shellResponse } from './shell.js';
import { liveRoute } from './live.js';

// 사이트마다 엔진을 한 번만 만들어 둔다 (인스턴스가 살아 있는 동안 재사용)
const engines = new Map();
function engineFor(site) {
  let e = engines.get(site.id);
  if (!e) {
    const community = createCommunity(site);
    const analytics = createAnalytics(site, community);
    const seo = createSeo(site).seo;
    e = createSite(site, { analytics, seo, community });
    engines.set(site.id, e);
  }
  return e;
}

// 사이트별 저장소: 기본 사이트는 DATA와 DB 그리고 나머지는 DATA_사이트이름과 DB_사이트이름 (wrangler.toml 참고)
function bind(env, site) {
  const sfx = site.id === DEFAULT_SITE ? '' : '_' + site.id.toUpperCase();
  const DATA = env['DATA' + sfx];
  const DB = env['DB' + sfx];
  if (!DATA) return null;
  return {
    ...env, DATA, DB, G: env.DATA, // G는 세 사이트가 함께 쓰는 쿠팡 호출 횟수 저장소
    ADMIN_PASSWORD: env['ADMIN_PASSWORD' + sfx] || env.ADMIN_PASSWORD,
    ASSETS: { fetch: async r => shellResponse(site, await env.ASSETS.fetch(r)) } // HTML 틀은 사이트별로 채워서 준다
  };
}

// 등록된 도메인이 아니면(workers.dev 미리보기 등) ?site=이름 또는 쿠키로 사이트를 고를 수 있다
function pick(url, req) {
  const real = siteForHost(url.hostname);
  if (real) return { site: real, set: null };
  const q = url.searchParams.get('site');
  const ck = (req.headers.get('cookie') || '').match(/(?:^|;\s*)site=([a-z]+)/);
  const id = SITES[q] ? q : ck && SITES[ck[1]] ? ck[1] : DEFAULT_SITE;
  return { site: SITES[id], set: SITES[q] ? q : null };
}

// 모든 응답에 붙이는 보안 헤더
const SEC = {
  'strict-transport-security': 'max-age=31536000',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'SAMEORIGIN',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()'
};
const secure = res => {
  if (res.status === 101) return res;
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries(SEC)) if (!r.headers.has(k)) r.headers.set(k, v);
  return r;
};

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const to = redirectForHost(url.hostname); // 다른 주소로 들어오면 경로와 검색어를 그대로 두고 대표 주소로 영구 이동
    if (to) return secure(Response.redirect(to + url.pathname + url.search, 301));
    const real = siteForHost(url.hostname);
    if (real && url.hostname !== new URL(real.host).hostname) return secure(Response.redirect(real.host + url.pathname + url.search, 301)); // www 주소는 대표 주소로 영구 이동
    if (url.pathname === '/api/promos') { // 매일 새로 만드는 배너 목록 (usb.kr이 가져다 쓴다)
      const items = AUTO_PROMOS.map(b => ({ id: b.id, text: b.text, url: b.url, host: SITES[b.site] ? SITES[b.site].host : '' }));
      return secure(new Response(JSON.stringify(items), { headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'public,max-age=3600' } }));
    }
    if (url.pathname === '/05c664617a377916dd44e02024763a73.txt') return new Response('05c664617a377916dd44e02024763a73', { headers: { 'content-type': 'text/plain' } }); // IndexNow 소유 확인 파일
    const lr = await liveRoute(url, env, req); // 실시간 배너 그림과 목록
    if (lr) return secure(lr);
    const { site, set } = pick(url, req);
    const senv = bind(env, site);
    if (!senv) return new Response('이 사이트의 저장소가 연결되지 않았습니다', { status: 503 });
    const res = secure(await engineFor(site).fetch(req, senv, ctx));
    if (!set) return res;
    res.headers.append('set-cookie', `site=${set}; Path=/; Max-Age=3600`);
    return res;
  },

  // 매시간 한 사이트씩 돌아가며 상품을 갱신한다 (세 사이트가 같은 쿠팡 키를 쓰므로 한 시간에 한 사이트만 불러 호출 한도를 지킨다)
  async scheduled(_evt, env, ctx) {
    const ids = (env.CRON_SITES || Object.keys(SITES).join(',')).split(',').map(s => s.trim()).filter(id => SITES[id]);
    const hour = new Date().getUTCHours();
    if (ids.length) {
      // 상품이 아직 적거나 비어 있는 분야가 있는 사이트가 있으면 순서와 상관없이 먼저 채운다
      let site = SITES[ids[hour % ids.length]];
      for (const id of ids) {
        const e = bind(env, SITES[id]);
        if (!e) continue;
        let n = 0, empty = 0;
        try {
          const list = (JSON.parse((await e.DATA.get('products')) || 'null') || {}).products || [];
          n = list.length;
          const have = new Set(list.map(p => p.category));
          empty = Object.keys(SITES[id].cats).filter(c => !have.has(c)).length; // 상품이 하나도 없는 분야 수
        } catch (x) {}
        if (n < 40 || empty > 0) { site = SITES[id]; break; }
      }
      const senv = bind(env, site);
      if (senv) ctx.waitUntil(engineFor(site).refresh(senv));
    }
    if (hour === 20) { // 하루에 한 번 오래된 접속 기록을 정리한다
      for (const site of Object.values(SITES)) {
        const senv = bind(env, site);
        if (senv) ctx.waitUntil(engineFor(site).analytics.pruneOld(senv));
      }
    }
  }
};
