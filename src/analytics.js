// 접속 기록(D1)과 관리자 통계 페이지(/0) — 사이트 설정과 커뮤니티를 받아 그 사이트용으로 만든다
import { PROMOS } from '../sites/index.js';
import { bnData, bnPage } from './banner-stats.js';
import { liveDelete } from './live.js';
const esc0 = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function createAnalytics(SITE, community) {
const { init: initCommunity, removeRow, adminNotice } = community;
let ready;
function init(env) {
  return (ready ||= (async () => {
    // 표가 이미 다 있으면 만들기 쿼리 열 개를 건너뛴다 (새 실행 환경마다 반복되던 약 0.5초 지연 제거)
    try { const r = await env.DB.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name IN ('hits','budget','price_hist','price_last','idx_hits_ts','idx_hits_iph','idx_hits_type','idx_price_hist')").first(); if (r && r.n >= 8) {
      // 표는 다 있어도 새 열(ipm)이 없으면 한 번 추가한다
      const c = await env.DB.prepare("SELECT COUNT(*) n FROM pragma_table_info('hits') WHERE name='ipm'").first();
      if (c && c.n > 0) return;
      try { await env.DB.prepare('ALTER TABLE hits ADD COLUMN ipm TEXT').run(); } catch (e) {}
      return;
    } } catch (e) {}
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS hits (ts INTEGER, type TEXT, code TEXT, pid TEXT, name TEXT, country TEXT, city TEXT, device TEXT, browser TEXT, os TEXT, ref TEXT, lang TEXT, vid TEXT, bot INTEGER)').run();
    try { await env.DB.prepare('ALTER TABLE hits ADD COLUMN iph TEXT').run(); } catch (e) {} // 이미 있으면 무시
    try { await env.DB.prepare('ALTER TABLE hits ADD COLUMN ipm TEXT').run(); } catch (e) {} // 셋째 자리를 가린 IP
    await env.DB.batch([
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_hits_ts ON hits (ts)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_hits_iph ON hits (iph, ts)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_hits_type ON hits (type, bot, ts)'), // 클릭 집계가 방문 행까지 읽지 않게
      env.DB.prepare('CREATE TABLE IF NOT EXISTS budget (day TEXT PRIMARY KEY, n INTEGER)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS price_hist (pid TEXT, ts INTEGER, price INTEGER)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_price_hist ON price_hist (pid, ts)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS price_last (pid TEXT PRIMARY KEY, price INTEGER, ts INTEGER)')
    ]);
  })());
}

async function sha(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}

const HOSTING = /amazon|aws|google|microsoft|azure|digitalocean|ovh|hetzner|linode|vultr|oracle|alibaba|tencent|choopa|leaseweb|contabo|scaleway|datacamp|m247|packet|cherry|kamatera|hostinger|godaddy|rackspace|equinix|colocrossing|psychz|quadranet|cogent|zenlayer|ucloud|huawei|baidu|serverius|stark industries|data center|datacenter|hosting|vps/i;

function parseUA(ua) {
  const bot = /bot|crawl|spider|slurp|facebookexternalhit|preview|monitor|curl|wget|python|headless|lighthouse|go-http|axios|uptime/i.test(ua) ? 1 : 0;
  let device = 'PC';
  if (/ipad|tablet/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua))) device = '태블릿';
  else if (/mobi|android|iphone|ipod/i.test(ua)) device = '모바일';
  let browser = '기타';
  if (/KAKAOTALK/i.test(ua)) browser = '카카오톡';
  else if (/NAVER\(inapp/i.test(ua)) browser = '네이버앱';
  else if (/Whale/i.test(ua)) browser = '웨일';
  else if (/SamsungBrowser/i.test(ua)) browser = '삼성인터넷';
  else if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
  else if (/Firefox|FxiOS/i.test(ua)) browser = 'Firefox';
  else if (/CriOS|Chrome/i.test(ua)) browser = 'Chrome';
  else if (/Safari/i.test(ua)) browser = 'Safari';
  let os = '기타';
  if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod|iOS/i.test(ua)) os = 'iOS';
  else if (/Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';
  return { bot, device, browser, os };
}

async function track(env, req, ev) {
  try {
    if (!env.DB) return;
    if (await overBudget(env)) return; // 오늘 요청 한도에 가까우면 기록 쓰기를 멈춘다
    await init(env);
    const ua = req.headers.get('user-agent') || '';
    let { bot, device, browser, os } = parseUA(ua);
    const cf = req.cf || {};
    const ip = req.headers.get('cf-connecting-ip') || '';
    const day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    const vid = (await sha(`${ip}|${ua}|${day}`)).slice(0, 16); // 원본 IP는 저장하지 않음
    const ipm = maskIp(ip); // 원본은 버리고 셋째 자리를 별표로 가린 값만 남긴다
    const iph = ip ? (await sha(`petit-ip|${ip}`)).slice(0, 16) : '';
    // 같은 IP의 방문은 2시간에 한 번만 집계
    if (ev.type === 'view' && iph) {
      const seen = await env.DB.prepare("SELECT 1 x FROM hits WHERE type='view' AND iph=? AND ts>? LIMIT 1").bind(iph, Date.now() - 2 * 3600e3).first();
      if (seen) return;
    }
    let ref = '';
    try { ref = new URL(req.headers.get('referer') || '').hostname; } catch (e) {}
    if (SITE.domains.some(d => ref === d || ref.endsWith('.' + d.replace(/^www\./, '')))) ref = '';
    const lang = (req.headers.get('accept-language') || '').split(',')[0].slice(0, 12);
    // 사람처럼 보이는 자동화 트래픽 걸러내기: 호스팅 회사 망과 언어 헤더 없음과 비문서 요청과 짧은 시간의 연속 클릭
    if (HOSTING.test(String(cf.asOrganization || '')) || !lang) bot = 1;
    if (ev.type === 'click') {
      const dest = req.headers.get('sec-fetch-dest');
      if (dest && dest !== 'document') bot = 1;
      if (iph) {
        const burst = await env.DB.prepare("SELECT COUNT(*) n FROM hits WHERE type='click' AND iph=? AND ts>?").bind(iph, Date.now() - 60e3).first();
        if (burst && burst.n >= 5) bot = 1;
        const dup = await env.DB.prepare("SELECT 1 x FROM hits WHERE type='click' AND iph=? AND pid=? AND ts>? LIMIT 1").bind(iph, String(ev.pid || ''), Date.now() - 10 * 60e3).first();
        if (dup) return; // 같은 사람이 같은 상품을 10분 안에 다시 누른 것은 한 번만 센다
      }
    }
    await env.DB.prepare('INSERT INTO hits (ts,type,code,pid,name,country,city,device,browser,os,ref,lang,vid,bot,iph,ipm) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(Date.now(), ev.type, ev.code || '', ev.pid || '', ev.name || '', cf.country || '', cf.city || '', device, browser, os, ref, lang, vid, bot, iph, ipm).run();
  } catch (e) { console.error('track', e.message); }
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = n => Number(n || 0).toLocaleString('ko-KR');

function safeEq(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function authed(req, env) {
  const h = req.headers.get('authorization') || '';
  if (!h.startsWith('Basic ')) return false;
  let s;
  try { s = atob(h.slice(6)); } catch (e) { return false; }
  return safeEq(s.slice(s.indexOf(':') + 1), env.ADMIN_PASSWORD);
}

const q = async (env, sql, ...b) => (await env.DB.prepare(sql).bind(...b).all()).results || [];

function bars(rows, label = r => r.k, link = null) {
  const max = Math.max(1, ...rows.map(r => r.c));
  if (!rows.length) return '<p class="mute">데이터가 없습니다</p>';
  return rows.map(r => `<div class="row"><span class="lb">${link && link(r) ? `<a href="${esc(link(r))}" target="_blank" rel="noopener nofollow">${esc(label(r))}</a>` : esc(label(r))}</span><span class="bar"><i style="width:${Math.round(r.c / max * 100)}%"></i></span><b>${num(r.c)}</b></div>`).join('');
}

// 관리자 화면에 틀린 비밀번호로 계속 들어오면 15분 동안 막는다 (같은 접속 위치에서 열 번까지)
const rlKey = req => new Request('https://rl.internal/' + (req.headers.get('cf-connecting-ip') || 'x'));
async function rlCount(req) {
  try { const hit = await caches.default.match(rlKey(req)); return hit ? Number(await hit.text()) || 0 : 0; } catch (e) { return 0; }
}
async function rlFail(req) {
  try { const n = (await rlCount(req)) + 1; await caches.default.put(rlKey(req), new Response(String(n), { headers: { 'cache-control': 'max-age=900' } })); } catch (e) {}
}

// 배너별 통계 화면 (/0/bn)과 숫자만 담은 JSON (/0/bn.json): 같은 관리자 비밀번호로 연다
async function bannerAdmin(req, env, url) {
  const head = { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' };
  if (!env.ADMIN_PASSWORD) return new Response('ADMIN_PASSWORD 가 필요합니다', { status: 500, headers: head });
  if ((await rlCount(req)) >= 10) return new Response('시도가 너무 많습니다. 15분 뒤에 다시 해 주세요', { status: 429, headers: { ...head, 'retry-after': '900' } });
  if (!authed(req, env)) { if (req.headers.get('authorization')) await rlFail(req); return new Response('로그인이 필요합니다', { status: 401, headers: { ...head, 'www-authenticate': 'Basic realm="stats"' } }); }
  const dp = Number(url.searchParams.get('d'));
  const d = [0, 1, 7, 30].includes(dp) && url.searchParams.has('d') ? dp : 7;
  const data = await bnData({ DB: env.GDB, G: env.G }, d);
  if (url.pathname.endsWith('.json')) return new Response(JSON.stringify({ d, total: data.total, video: data.video, image: data.image, bySite: data.bySite, hosts: data.hosts }), { headers: { ...head, 'content-type': 'application/json' } });
  return new Response(bnPage(data), { headers: head });
}

async function admin(req, env, url) {
  const head = { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' };
  if (!env.ADMIN_PASSWORD) return new Response('<meta charset="utf-8"><body style="font-family:sans-serif;padding:40px">통계 페이지를 쓰려면 GitHub 시크릿 ADMIN_PASSWORD를 등록하고 다시 배포하세요.', { status: 503, headers: head });
  if ((await rlCount(req)) >= 10) return new Response('시도가 너무 많습니다. 15분 뒤에 다시 해 주세요', { status: 429, headers: { ...head, 'retry-after': '900' } });
  if (!authed(req, env)) { if (req.headers.get('authorization')) await rlFail(req); return new Response('로그인이 필요합니다', { status: 401, headers: { ...head, 'www-authenticate': 'Basic realm="stats", charset="UTF-8"' } }); }
  if (!env.DB) return new Response('D1 데이터베이스가 연결되지 않았습니다', { status: 500, headers: head });
  await init(env);
  await initCommunity(env);

  if (req.method === 'POST') {
    const b = await req.json().catch(() => ({}));
    if (b.a === 'del' && (b.t === 'posts' || b.t === 'comments') && Number(b.id)) { await removeRow(env, b.t, Number(b.id)); return new Response('{"ok":true}', { headers: head }); }
    if (b.a === 'livedel' && b.id) { const ok = await liveDelete(env.G, String(b.id)); return new Response(JSON.stringify({ ok }), { headers: head }); }
    if (b.a === 'notice' && b.title && b.body) { await adminNotice(env, b.title, b.body); return new Response('{"ok":true}', { headers: head }); }
    return new Response('{"error":"bad"}', { status: 400, headers: head });
  }

  const ranges = { 1: '24시간', 7: '7일', 30: '30일', 90: '90일' };
  const d = ranges[url.searchParams.get('d')] ? Number(url.searchParams.get('d')) : 7;
  const since = Date.now() - d * 86400e3;
  const W = 'WHERE bot=0 AND ts>=?';
  const KST = "(ts+32400000)/1000";
  const [mPosts, mComments] = await Promise.all([
    q(env, 'SELECT id,board,title,nick,ts,ccount,likes FROM posts WHERE hidden=0 ORDER BY ts DESC LIMIT 25'),
    q(env, 'SELECT id,pid,body,nick,ts FROM comments WHERE hidden=0 ORDER BY ts DESC LIMIT 20')
  ]);
  const [tot, daily, hourly, top, country, city, device, browser, os, ref, recent, bots, ips] = await Promise.all([
    q(env, `SELECT SUM(type='view') v, COUNT(DISTINCT CASE WHEN type='view' THEN vid END) u, SUM(type='click') c, COUNT(DISTINCT CASE WHEN type='click' THEN vid END) cu FROM hits ${W}`, since),
    q(env, `SELECT date(${KST},'unixepoch') d, SUM(type='view') v, COUNT(DISTINCT CASE WHEN type='view' THEN vid END) u, SUM(type='click') c FROM hits ${W} GROUP BY d ORDER BY d`, since),
    q(env, `SELECT CAST(strftime('%H',${KST},'unixepoch') AS INTEGER) h, COUNT(*) c FROM hits ${W} AND type='view' GROUP BY h`, since),
    q(env, `SELECT pid, name, code, COUNT(*) c FROM hits ${W} AND type='click' GROUP BY pid ORDER BY c DESC LIMIT 15`, since),
    q(env, `SELECT CASE WHEN country='' THEN '알 수 없음' ELSE country END k, COUNT(*) c FROM hits ${W} AND type='view' GROUP BY k ORDER BY c DESC LIMIT 10`, since),
    q(env, `SELECT CASE WHEN city='' THEN '알 수 없음' ELSE city END k, COUNT(*) c FROM hits ${W} AND type='view' GROUP BY k ORDER BY c DESC LIMIT 10`, since),
    q(env, `SELECT device k, COUNT(*) c FROM hits ${W} AND type='view' GROUP BY k ORDER BY c DESC`, since),
    q(env, `SELECT browser k, COUNT(*) c FROM hits ${W} AND type='view' GROUP BY k ORDER BY c DESC LIMIT 8`, since),
    q(env, `SELECT os k, COUNT(*) c FROM hits ${W} AND type='view' GROUP BY k ORDER BY c DESC LIMIT 8`, since),
    q(env, `SELECT CASE WHEN ref='' THEN '직접 접속' ELSE ref END k, COUNT(*) c FROM hits ${W} AND type='view' GROUP BY k ORDER BY c DESC LIMIT 10`, since),
    q(env, 'SELECT * FROM hits WHERE bot=0 ORDER BY ts DESC LIMIT 40'),
    q(env, 'SELECT COUNT(*) c FROM hits WHERE bot=1 AND ts>=?', since),
    q(env, `SELECT ipm k, COUNT(*) c FROM hits ${W} AND ipm<>'' GROUP BY k ORDER BY c DESC LIMIT 15`, since)
  ]);
  // 하루는 한국시간 밤 0시부터 24시까지로 센다 (오늘과 어제를 같은 기준으로 비교)
  const DAY = 86400e3, now = Date.now();
  const t0 = Math.floor((now + 9 * 3600e3) / DAY) * DAY - 9 * 3600e3; // 오늘 0시
  const uq = (a, b) => env.DB.prepare("SELECT COUNT(DISTINCT CASE WHEN type='view' THEN vid END) u FROM hits WHERE bot=0 AND ts>=? AND ts<?").bind(a, b).first().then(r => (r && r.u) || 0).catch(() => 0);
  const [uToday, uYest, uYestSame] = await Promise.all([uq(t0, now + 1), uq(t0 - DAY, t0), uq(t0 - DAY, now - DAY + 1)]);
  // 신규와 재방문 (접속 주소 해시 기준 추정) / 요일별 / 분야별 클릭
  const [nr, wk, cl, pj] = await Promise.all([
    q(env, `SELECT COUNT(DISTINCT iph) n, COUNT(DISTINCT CASE WHEN EXISTS (SELECT 1 FROM hits o WHERE o.iph=hits.iph AND o.ts<?) THEN iph END) r FROM hits ${W} AND type='view' AND iph<>''`, since, since),
    q(env, `SELECT CAST(strftime('%w',${KST},'unixepoch') AS INTEGER) k, COUNT(*) c FROM hits ${W} AND type='view' GROUP BY k`, since),
    q(env, `SELECT pid, COUNT(*) c FROM hits ${W} AND type='click' GROUP BY pid`, since),
    env.DATA.get('products').then(x => JSON.parse(x || 'null')).catch(() => null)
  ]);
  const catOf = Object.fromEntries(((pj && pj.products) || []).map(p => [String(p.id), p.category]));
  const byCat = {}; cl.forEach(r => { const c = catOf[String(r.pid)] || '목록에서 빠진 상품'; byCat[c] = (byCat[c] || 0) + r.c; });
  const catRows = Object.entries(byCat).map(([k, c]) => ({ k, c })).sort((a, b) => b.c - a.c).slice(0, 12);
  const wnames = ['일', '월', '화', '수', '목', '금', '토'];
  const wmap = Object.fromEntries(wk.map(r => [r.k, r.c]));
  const wrows = wnames.map((k, i) => ({ k: k + '요일', c: wmap[i] || 0 }));
  const nrow = nr[0] || {}; const retN = nrow.r || 0, newN = Math.max(0, (nrow.n || 0) - retN);
  const sg = n => (n > 0 ? '+' : '') + num(n);
  const bud = await env.DB.prepare('SELECT n FROM budget WHERE day=?').bind(utcDay()).first().catch(() => null);
  let imgq = null;
  try { imgq = JSON.parse((await env.DATA.get('imgq')) || 'null'); } catch (e) {}
  const month = await env.DB.prepare('SELECT SUM(n) s FROM budget WHERE day>=?').bind(utcDay().slice(0, 7) + '-01').first().catch(() => null);
  const usage = { month: month && month.s ? month.s : 0, req: bud ? bud.n : 0, lim: Number(env.DAILY_BUDGET || 300000), img: imgq && imgq.m === utcDay().slice(0, 7) ? imgq.n : 0, imgLim: 4000 };
  const t = tot[0] || {};
  const ctr = t.v ? ((t.c || 0) / t.v * 100).toFixed(1) : '0.0';
  const maxD = Math.max(1, ...daily.map(r => Math.max(r.v, r.c)));
  const chart = daily.length ? `<div class="chart">${daily.map(r => `<div class="col" title="${esc(r.d)} 방문 ${r.v} 클릭 ${r.c}"><div class="stack"><i class="v" style="height:${Math.round(r.v / maxD * 100)}%"></i><i class="c" style="height:${Math.round(r.c / maxD * 100)}%"></i></div><small>${esc(r.d.slice(5))}</small></div>`).join('')}</div>` : '<p class="mute">데이터가 없습니다</p>';
  const hmap = Object.fromEntries(hourly.map(r => [r.h, r.c]));
  const hrows = Array.from({ length: 24 }, (_, h) => ({ k: `${h}시`, c: hmap[h] || 0 }));
  const hmax = Math.max(1, ...hrows.map(r => r.c));
  const hours = `<div class="hours">${hrows.map(r => `<div title="${r.k} ${r.c}"><i style="height:${Math.round(r.c / hmax * 100)}%"></i><small>${r.k.replace('시', '')}</small></div>`).join('')}</div>`;
  const kst = ts => new Date(ts + 9 * 3600e3).toISOString().slice(5, 16).replace('T', ' ');
  const tabs = Object.entries(ranges).map(([k, v]) => `<a href="/0?d=${k}" class="${Number(k) === d ? 'on' : ''}">${v}</a>`).join('');

  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>통계 | ${esc0(SITE.name)}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>
:root{--bg:${SITE.theme.dark.bg};--card:${SITE.theme.dark.card};--line:${SITE.theme.dark.line};--ink:${SITE.theme.dark.ink};--mute:${SITE.theme.dark.mute};--p1:${SITE.theme.light.p1};--p2:${SITE.theme.light.p2};--p3:${SITE.theme.light.p3}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:Pretendard Variable,Pretendard,system-ui,sans-serif;padding:20px clamp(14px,4vw,40px) 60px}
h1{margin:0;font-size:1.5rem}h1 span{color:var(--p1)}header{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:20px}
.tabs a{color:var(--mute);text-decoration:none;padding:8px 14px;border:1px solid var(--line);border-radius:999px;margin-left:6px;font-size:.85rem}.tabs a.on{background:linear-gradient(135deg,var(--p1),var(--p2));color:#fff;border-color:transparent}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px}
.kpi,.box{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:16px}
.kpi b{display:block;font-size:1.8rem;font-weight:900;background:linear-gradient(135deg,var(--p1),var(--p2));-webkit-background-clip:text;background-clip:text;color:transparent}.kpi span{color:var(--mute);font-size:.8rem}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px;margin-bottom:12px}
.box h2{margin:0 0 12px;font-size:.95rem}.mute{color:var(--mute);font-size:.85rem}
.row{display:flex;align-items:center;gap:8px;margin:7px 0;font-size:.85rem}.lb{width:34%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bar{flex:1;height:8px;background:var(--line);border-radius:6px;overflow:hidden}.bar i{display:block;height:100%;background:linear-gradient(90deg,var(--p1),var(--p2))}.row b{min-width:34px;text-align:right}
.chart{display:flex;gap:4px;align-items:flex-end;height:170px;overflow-x:auto}.col{flex:1;min-width:22px;display:flex;flex-direction:column;align-items:center;height:100%}.stack{flex:1;width:100%;display:flex;gap:2px;align-items:flex-end}.stack i{flex:1;border-radius:4px 4px 0 0;min-height:2px}.v{background:var(--p3)}.c{background:var(--p1)}.col small,.hours small{color:var(--mute);font-size:.62rem;margin-top:4px}
.hours{display:flex;gap:3px;align-items:flex-end;height:120px}.hours div{flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center}.hours i{width:100%;background:var(--p2);border-radius:3px 3px 0 0;min-height:2px}
.legend{font-size:.75rem;color:var(--mute);margin-bottom:8px}.legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin:0 4px 0 10px}
button{background:var(--p1);color:#fff;border:0;border-radius:8px;padding:6px 12px;cursor:pointer;font:inherit}table{width:100%;border-collapse:collapse;font-size:.8rem}th,td{text-align:left;padding:8px 6px;border-bottom:1px solid var(--line);white-space:nowrap}th{color:var(--mute);font-weight:600}.wrap{overflow-x:auto}
.tag{padding:2px 8px;border-radius:6px;font-size:.7rem;font-weight:800}.tag.click{background:var(--p1)}.tag.view{background:var(--p3)}
</style></head><body>
<header><h1><a href="${esc0(SITE.host)}/" style="color:inherit;text-decoration:none" title="사이트 메인으로">${esc0(SITE.name)}</a> <span>통계</span> <a href="/0/bn" style="font-size:.8rem;font-weight:600;margin-left:10px;color:inherit;opacity:.85">배너 통계 →</a></h1><nav class="tabs">${tabs}</nav></header>
<section class="kpis">
<div class="kpi"><b>${num(uToday)}</b><span>오늘 방문자 (0시부터 지금까지)</span></div>
<div class="kpi"><b>${num(uYest)}</b><span>어제 방문자 (0시부터 24시)</span></div>
<div class="kpi"><b>${sg(uToday - uYest)}</b><span>어제 하루 전체 대비 증감</span></div>
<div class="kpi"><b>${sg(uToday - uYestSame)}</b><span>어제 같은 시각 대비 증감</span></div>
<div class="kpi"><b>${num(t.v)}</b><span>방문 (페이지뷰)</span></div>
<div class="kpi"><b>${num(t.u)}</b><span>방문자 (일 기준)</span></div>
<div class="kpi"><b>${num(newN)}</b><span>신규 방문자 (기간 안 첫 방문 추정)</span></div>
<div class="kpi"><b>${num(retN)}</b><span>재방문자 (이전에도 온 접속 추정)</span></div>
<div class="kpi"><b>${t.u ? ((t.cu || 0) / t.u * 100).toFixed(1) : '0.0'}%</b><span>클릭한 방문자 비율</span></div>
<div class="kpi"><b>${t.u ? (t.v / t.u).toFixed(2) : '0.00'}</b><span>방문자당 방문 횟수</span></div>
<div class="kpi"><b>${num(t.c)}</b><span>상품 클릭</span></div>
<div class="kpi"><b>${ctr}%</b><span>클릭률</span></div>
<div class="kpi"><b>${num(bots[0] && bots[0].c)}</b><span>제외된 봇</span></div>
<div class="kpi"><b>${num(usage.req)}</b><span>오늘 요청 추정 (경고 기준 ${num(usage.lim)})</span></div>
<div class="kpi"><b>${num(usage.month)}</b><span>이번 달 요청 추정 (계정 포함 1000만)</span></div>
<div class="kpi"><b>${num(usage.img)}</b><span>이번 달 이미지 변환 (한도 ${num(usage.imgLim)})</span></div>
</section>
<section class="box"><h2>일별 추이 (한국시간)</h2><div class="legend"><i style="background:var(--p3)"></i>방문<i style="background:var(--p1)"></i>클릭</div>${chart}</section>
<section class="box" style="margin-top:12px"><h2>일별 요약 (한국시간)</h2><div class="wrap"><table><tr><th>날짜</th><th>방문자</th><th>방문</th><th>클릭</th><th>클릭률</th></tr>${daily.slice().reverse().map(r => `<tr><td>${esc(r.d)}</td><td>${num(r.u)}</td><td>${num(r.v)}</td><td>${num(r.c)}</td><td>${r.v ? (r.c / r.v * 100).toFixed(1) : '0.0'}%</td></tr>`).join('') || '<tr><td colspan="5" class="mute">기록이 없습니다</td></tr>'}</table></div></section>
<section class="grid" style="margin-top:12px">
<div class="box"><h2>인기 상품 클릭 TOP</h2>${bars(top, r => `${r.code} ${r.name}`, r => r.code ? `${SITE.host}/${r.code}?go=a` : '')}</div>
<div class="box"><h2>시간대별 방문</h2>${hours}</div>
<div class="box"><h2>요일별 방문</h2>${bars(wrows)}</div>
<div class="box"><h2>분야별 클릭</h2>${bars(catRows)}</div>
<div class="box"><h2>유입 경로</h2>${bars(ref)}</div>
<div class="box"><h2>국가</h2>${bars(country)}</div>
<div class="box"><h2>도시</h2>${bars(city)}</div>
<div class="box"><h2>기기</h2>${bars(device)}</div>
<div class="box"><h2>브라우저</h2>${bars(browser)}</div>
<div class="box"><h2>운영체제</h2>${bars(os)}</div>
<div class="box"><h2>접속 IP TOP (셋째 자리 가림)</h2>${bars(ips)}</div>
</section>
<section class="box"><h2>최근 활동</h2><div class="wrap"><table><tr><th>시간</th><th>구분</th><th>내용</th><th>지역</th><th>기기</th><th>브라우저</th><th>OS</th><th>IP</th><th>유입</th></tr>
${recent.map(r => `<tr><td>${kst(r.ts)}</td><td><span class="tag ${r.type}">${r.type === 'click' ? '클릭' : '방문'}</span></td><td>${r.type === 'click' && r.code ? `<a href="${esc(SITE.host)}/${esc(r.code)}?go=a" target="_blank" rel="noopener nofollow">${esc(`${r.code} ${r.name}`.slice(0, 40))}</a>` : esc(r.type === 'click' ? `${r.code} ${r.name}`.slice(0, 40) : '메인')}</td><td>${esc(`${r.country} ${r.city}`.trim())}</td><td>${esc(r.device)}</td><td>${esc(r.browser)}</td><td>${esc(r.os)}</td><td>${esc(r.ipm || '')}</td><td>${esc(r.ref || '직접')}</td></tr>`).join('') || '<tr><td colspan="9" class="mute">기록이 없습니다</td></tr>'}
</table></div></section>
<section class="box" style="margin-top:12px"><h2>배너 모아보기 (최근 10개 · 전체 ${PROMOS.length}개)</h2><p class="mute">이 사이트에서는 자기 사이트 배너를 뺀 나머지가 무작위로 하나씩 보입니다. 이미지를 누르면 크게 보입니다.</p><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px">${PROMOS.slice(-10).reverse().map(b => `<div><a href="${esc0(SITE.host)}/promo/${esc0(b.id)}-w.webp?v=7" class="zoom"><picture><source media="(min-width:761px)" srcset="${esc0(SITE.host)}/promo/${esc0(b.id)}-w.webp?v=7"><img src="${esc0(SITE.host)}/promo/${esc0(b.id)}-n.webp?v=7" alt="${esc0(b.text)}" loading="lazy" style="width:100%;border-radius:10px;display:block"></picture></a><small class="mute">${esc0(b.id)} · ${esc0(b.site)} · <a href="${esc0(b.url)}" target="_blank" rel="noopener nofollow">링크</a>${b.site === SITE.id ? ' (이 사이트 배너)' : ''} · ${esc0(b.text)}</small></div>`).join('')}</div></section>
<section class="box" style="margin-top:12px"><h2>실시간 배너 (<span id="lc">0</span>개)</h2><p class="mute">매시간 새 사진으로 만들어 보여 줍니다. 이미지를 누르면 크게 보입니다. 사진과 문구가 어긋나면 삭제를 누르세요. 그 사진은 다시 나오지 않습니다.</p><div id="live" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px"></div></section>
<section class="box" style="margin-top:12px"><h2>커뮤니티 관리</h2>
<div class="wrap"><table><tr><th>번호</th><th>게시판</th><th>제목</th><th>작성자</th><th>댓글</th><th>좋아요</th><th>시간</th><th></th></tr>
${mPosts.map(r => `<tr><td>${r.id}</td><td>${esc(r.board)}</td><td>${esc(r.title.slice(0, 30))}</td><td>${esc(r.nick)}</td><td>${r.ccount}</td><td>${r.likes}</td><td>${kst(r.ts)}</td><td><button onclick="del('posts',${r.id})">삭제</button></td></tr>`).join('') || '<tr><td colspan="8" class="mute">글이 없습니다</td></tr>'}
</table></div>
<h2 style="margin-top:16px">최근 댓글</h2><div class="wrap"><table><tr><th>글</th><th>내용</th><th>작성자</th><th>시간</th><th></th></tr>
${mComments.map(r => `<tr><td>${r.pid}</td><td>${esc(r.body.slice(0, 40))}</td><td>${esc(r.nick)}</td><td>${kst(r.ts)}</td><td><button onclick="del('comments',${r.id})">삭제</button></td></tr>`).join('') || '<tr><td colspan="5" class="mute">댓글이 없습니다</td></tr>'}
</table></div>
<h2 style="margin-top:16px">공지 쓰기</h2>
<input id="nt" placeholder="제목" style="width:100%;padding:8px;margin-bottom:6px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--ink)">
<textarea id="nb" rows="4" placeholder="내용" style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--ink)"></textarea>
<button onclick="notice()" style="margin-top:6px">공지 등록</button></section>
<script>
document.addEventListener('click',e=>{const a=e.target.closest('a.zoom');if(!a)return;e.preventDefault();const o=document.createElement('div');o.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;z-index:99;cursor:zoom-out;padding:16px';o.innerHTML=/\.mp4/.test(a.href)?'<video src="'+a.href+'" autoplay muted loop playsinline controls style="max-width:100%;max-height:100%;border-radius:10px"></video>':'<img src="'+a.href+'" style="max-width:100%;max-height:100%;border-radius:10px">';o.onclick=()=>o.remove();document.body.appendChild(o)});
document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('body>div[style*="z-index:99"]').forEach(x=>x.remove())});
fetch('/api/live').then(r=>r.json()).then(L=>{document.getElementById('lc').textContent='최근 10개 · 전체 '+L.length;document.getElementById('live').innerHTML=L.map((b,i)=>({b:b,i:i})).sort((x,y)=>((y.b.ts||0)-(x.b.ts||0))||(y.i-x.i)).slice(0,10).map(z=>z.b).map(b=>'<div id="lv-'+b.id+'"><a class="zoom" href="/live/'+b.id+(b.video?'-w.mp4':'-w.webp')+'">'+(b.video?'<video src="/live/'+b.id+'-n.mp4" poster="/live/'+b.id+'-n.webp" autoplay muted loop playsinline preload="metadata" style="width:100%;border-radius:10px;display:block"></video>':'<img src="/live/'+b.id+'-n.webp" alt="" loading="lazy" style="width:100%;border-radius:10px;display:block">')+'</a><small class="mute">'+(b.video?'🎬 ':'')+b.id+' · '+b.site+' · '+b.text.replace(/[<>&"]/g,'')+' · <a href="'+b.url+'" target="_blank" rel="noopener nofollow">링크</a></small> <button data-id="'+b.id+'" onclick="livedel(this.dataset.id)">삭제</button></div>').join('')}).catch(function(){});
async function livedel(id){if(!confirm('이 배너를 지울까요?'))return;if(await post({a:'livedel',id:id})){var e=document.getElementById('lv-'+id);if(e)e.remove()}}
async function post(b){const r=await fetch('/0',{method:'POST',body:JSON.stringify(b)});if(!r.ok){alert('실패했습니다');return false}return true}
async function del(t,id){if(confirm('삭제할까요?')&&await post({a:'del',t,id}))location.reload()}
async function notice(){const t=document.getElementById('nt').value,b=document.getElementById('nb').value;if(await post({a:'notice',title:t,body:b}))location.reload()}
</script>
<p class="mute" style="margin-top:16px">원본 IP는 저장하지 않고 셋째 자리를 가린 IP(예 203.0.*.45)와 섞은 해시만 보관합니다. 봇은 통계에서 제외됩니다.</p>
</body></html>`;
  return new Response(html, { headers: head });
}

// 최근 7일 실제 클릭 수 (봇 제외)
async function clickCounts(env) {
  try {
    await init(env);
    const rows = await q(env, "SELECT pid, COUNT(DISTINCT CASE WHEN iph<>'' THEN iph ELSE vid END) c FROM hits WHERE type='click' AND bot=0 AND ts>? AND pid<>'' GROUP BY pid", Date.now() - 7 * 86400e3);
    return Object.fromEntries(rows.map(r => [r.pid, r.c]));
  } catch (e) { return {}; }
}

// ---- 무료 한도 보호 ----
const utcDay = (off = 0) => new Date(Date.now() + off * 86400e3).toISOString().slice(0, 10);

// 요청 수는 5%만 표본으로 세어서 D1 쓰기를 아낀다 (표본 한 번에 20 증가)
function countRequest(env, ctx) {
  if (!env.DB || Math.random() >= 0.05) return;
  ctx.waitUntil((async () => {
    try {
      await init(env);
      await env.DB.prepare('INSERT INTO budget (day,n) VALUES (?,20) ON CONFLICT(day) DO UPDATE SET n=n+20').bind(utcDay()).run();
    } catch (e) {}
  })());
}

let ob = { t: 0, v: false };
async function overBudget(env) {
  if (!env.DB) return false;
  if (Date.now() - ob.t < 60000) return ob.v;
  ob.t = Date.now();
  try {
    await init(env);
    const r = await env.DB.prepare('SELECT n FROM budget WHERE day=?').bind(utcDay()).first();
    ob.v = !!r && r.n >= Number(env.DAILY_BUDGET || 300000);
  } catch (e) {}
  return ob.v;
}

// 오래된 접속 기록은 90일 뒤 지워 DB 읽기량과 용량을 일정하게 유지
// 203.0.113.45 는 203.0.*.45 로 가린다 (IPv6는 셋째 묶음을 가리고 앞 네 묶음만 남긴다)
function maskIp(ip) {
  if (!ip) return '';
  if (ip.includes(':')) { const g = ip.split(':'); if (g.length > 2) g[2] = '*'; return g.slice(0, 4).join(':'); }
  const g = ip.split('.');
  return g.length === 4 ? `${g[0]}.${g[1]}.*.${g[3]}` : '';
}

async function pruneOld(env) {
  try {
    if (!env.DB) return;
    await init(env);
    await env.DB.prepare('DELETE FROM hits WHERE ts<?').bind(Date.now() - 90 * 86400e3).run();
    await env.DB.prepare('DELETE FROM budget WHERE day<?').bind(utcDay(-30)).run();
    await env.DB.prepare('DELETE FROM price_hist WHERE ts<?').bind(Date.now() - 400 * 86400e3).run();
  } catch (e) {}
}

// ---- 가격 기록: 값이 바뀐 상품만 한 줄씩 쌓는다 ----
async function recordPrices(env, products) {
  if (!env.DB) return;
  await init(env);
  const last = new Map(((await env.DB.prepare('SELECT pid, price FROM price_last').all()).results || []).map(r => [r.pid, r.price]));
  const now = Date.now();
  const st = [];
  for (const p of products) {
    const pr = Number(p.price) || 0;
    if (!pr || last.get(String(p.id)) === pr) continue;
    st.push(env.DB.prepare('INSERT INTO price_hist (pid,ts,price) VALUES (?,?,?)').bind(String(p.id), now, pr));
    st.push(env.DB.prepare('INSERT INTO price_last (pid,price,ts) VALUES (?,?,?) ON CONFLICT(pid) DO UPDATE SET price=excluded.price, ts=excluded.ts').bind(String(p.id), pr, now));
  }
  if (st.length) await env.DB.batch(st);
}

async function getHist(env, id) {
  if (!env.DB) return [];
  const q = () => env.DB.prepare('SELECT ts, price FROM price_hist WHERE pid=? ORDER BY ts LIMIT 200').bind(String(id)).all();
  try { return (await q()).results || []; } // 표가 있으면 초기화 없이 바로 조회
  catch (e) { try { await init(env); return (await q()).results || []; } catch (e2) { return []; } }
}

return { track, admin, bannerAdmin, authed, clickCounts, countRequest, overBudget, pruneOld, recordPrices, getHist };
}
