// 진입점: 방문한 주소로 어느 사이트인지 찾아 그 사이트의 설정과 저장소로 요청을 처리한다
import { SITES, DEFAULT_SITE, siteForHost, redirectForHost, AUTO_PROMOS } from '../sites/index.js';
import { createCommunity } from './community.js';
import { createAnalytics } from './analytics.js';
import { createSeo } from './seo.js';
import { createSite } from './engine.js';
import { shellResponse } from './shell.js';
import { liveRoute } from './live.js';
import { bnBeacon, bnPrune } from './banner-stats.js';

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
    ...env, DATA, DB, G: env.DATA, GDB: env.DB, // G는 세 사이트가 함께 쓰는 쿠팡 호출 횟수 저장소
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
    if (url.pathname === '/api/bn') return bnBeacon(req, env, ctx); // 배너 노출과 클릭 신호
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

  // 매시간 모자란 사이트 두 곳만 차례로 갱신한다 (쿠팡 검색은 시간당 10번이라 두 곳이 4번씩 나눠 쓴다)
  // 모자람 = 상품이 없는 분야(분야마다 가중) + 상품 40개에 못 미친 수. 모자란 곳이 두 곳보다 적으면 가장 오래 갱신 안 한 곳으로 채운다
  async scheduled(_evt, env, ctx) {
    const ids = (env.CRON_SITES || Object.keys(SITES).join(',')).split(',').map(s => s.trim()).filter(id => SITES[id]);
    const hour = new Date().getUTCHours();
    if (ids.length) {
      const need = [];
      for (const id of ids) {
        const e = bind(env, SITES[id]);
        if (!e) continue;
        let n = 0, empty = 0, oldest = 0;
        try {
          const list = (JSON.parse((await e.DATA.get('products')) || 'null') || {}).products || [];
          n = list.length;
          const have = new Set(list.map(p => p.category));
          empty = Object.keys(SITES[id].cats).filter(c => !have.has(c)).length;
          const pool = JSON.parse((await e.DATA.get('pool')) || '{}');
          const ts = Object.entries(pool).filter(([k]) => !k.startsWith('__best')).map(([, v]) => (v && v.t) || 0);
          oldest = ts.length ? Math.min(...ts) : 0;
        } catch (x) {}
        need.push({ id, lack: empty * 100 + Math.max(0, 40 - n), oldest, rot: (ids.indexOf(id) - (hour % ids.length) + ids.length) % ids.length });
      }
      need.sort((a, b) => (b.lack > 0) - (a.lack > 0) || b.lack - a.lack || a.oldest - b.oldest || a.rot - b.rot);
      const picks = need.slice(0, 2);
      ctx.waitUntil((async () => {
        for (const p of picks) {
          const site = SITES[p.id], senv = bind(env, site);
          if (senv) await engineFor(site).refresh(senv, { perRun: picks.length > 1 ? 4 : 7 }).catch(e => console.error('refresh', p.id, e.message));
        }
      })());
    }
    ctx.waitUntil(kickGithub(env, hour).catch(e => console.error('kick', e.message))); // GitHub 예약 실행이 늦거나 안 돌 때를 대비해 Cloudflare 예약이 직접 깨운다
    if (hour === 20) { // 하루에 한 번 오래된 접속 기록을 정리한다
      ctx.waitUntil(bnPrune(env));
      for (const site of Object.values(SITES)) {
        const senv = bind(env, site);
        if (senv) ctx.waitUntil(engineFor(site).analytics.pruneOld(senv));
      }
    }
  }
};

// GitHub 의 예약 실행은 몇 시간씩 늦거나 건너뛰는 일이 있어서 Cloudflare 예약(정각마다)이 대신 작업을 깨운다. 시크릿 GITHUB_DISPATCH_TOKEN(저장소 Actions 쓰기 권한)이 있을 때만 동작한다
async function kickGithub(env, hour) {
  const tok = env.GITHUB_DISPATCH_TOKEN;
  if (!tok) return;
  const gh = (wf, inputs) => fetch(`https://api.github.com/repos/my0z/vutykr/actions/workflows/${wf}/dispatches`, {
    method: 'POST',
    headers: { authorization: `Bearer ${tok}`, accept: 'application/vnd.github+json', 'user-agent': 'vutykr-cron', 'x-github-api-version': '2022-11-28', 'content-type': 'application/json' },
    body: JSON.stringify({ ref: 'main', inputs: inputs || {} }),
  });
  let last = 0;
  try { last = Math.max(0, ...(JSON.parse((await env.DATA.get('live:index')) || '[]')).map(x => x.ts || 0)); } catch (e) {}
  if (Date.now() - last > 40 * 60e3) { const r = await gh('live-banners.yml', { count: '1', videos: '3' }); if (!r.ok) console.error('live-banners dispatch', r.status); }
  if (hour === 21) { const r = await gh('maintenance.yml'); if (!r.ok) console.error('maintenance dispatch', r.status); } // 한국 시간 오전 6시: 백업과 점검
}
