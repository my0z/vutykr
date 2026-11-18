// 진입점: 방문한 주소로 어느 사이트인지 찾아 그 사이트의 설정과 저장소로 요청을 처리한다
import { SITES, DEFAULT_SITE, siteForHost, redirectForHost } from '../sites/index.js';
import { createCommunity } from './community.js';
import { createAnalytics } from './analytics.js';
import { createSeo } from './seo.js';
import { createSite } from './engine.js';
import { shellResponse } from './shell.js';

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

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const to = redirectForHost(url.hostname); // 다른 주소로 들어오면 경로와 검색어를 그대로 두고 대표 주소로 영구 이동
    if (to) return Response.redirect(to + url.pathname + url.search, 301);
    const { site, set } = pick(url, req);
    const senv = bind(env, site);
    if (!senv) return new Response('이 사이트의 저장소가 연결되지 않았습니다', { status: 503 });
    const res = await engineFor(site).fetch(req, senv, ctx);
    if (!set) return res;
    const r = new Response(res.body, res);
    r.headers.append('set-cookie', `site=${set}; Path=/; Max-Age=3600`);
    return r;
  },

  // 매시간 한 사이트씩 돌아가며 상품을 갱신한다 (세 사이트가 같은 쿠팡 키를 쓰므로 한 시간에 한 사이트만 불러 호출 한도를 지킨다)
  async scheduled(_evt, env, ctx) {
    const ids = (env.CRON_SITES || Object.keys(SITES).join(',')).split(',').map(s => s.trim()).filter(id => SITES[id]);
    const hour = new Date().getUTCHours();
    if (ids.length) {
      // 상품이 아직 적은 새 사이트가 있으면 순서와 상관없이 먼저 채운다
      let site = SITES[ids[hour % ids.length]];
      for (const id of ids) {
        const e = bind(env, SITES[id]);
        if (!e) continue;
        let n = 0;
        try { n = (JSON.parse((await e.DATA.get('products')) || 'null') || {}).products.length; } catch (x) {}
        if (n < 40) { site = SITES[id]; break; }
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
