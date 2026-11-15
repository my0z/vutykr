import { init as initCommunity, removeRow, adminNotice } from './community.js';
// 접속 기록(D1)과 관리자 통계 페이지(/0)
let ready;
function init(env) {
  return (ready ||= env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS hits (ts INTEGER, type TEXT, code TEXT, pid TEXT, name TEXT, country TEXT, city TEXT, device TEXT, browser TEXT, os TEXT, ref TEXT, lang TEXT, vid TEXT, bot INTEGER)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_hits_ts ON hits (ts)')
  ]));
}

async function sha(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}

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

export async function track(env, req, ev) {
  try {
    if (!env.DB) return;
    await init(env);
    const ua = req.headers.get('user-agent') || '';
    const { bot, device, browser, os } = parseUA(ua);
    const cf = req.cf || {};
    const ip = req.headers.get('cf-connecting-ip') || '';
    const day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    const vid = (await sha(`${ip}|${ua}|${day}`)).slice(0, 16); // 원본 IP는 저장하지 않음
    let ref = '';
    try { ref = new URL(req.headers.get('referer') || '').hostname; } catch (e) {}
    if (ref.endsWith('vuty.kr')) ref = '';
    const lang = (req.headers.get('accept-language') || '').split(',')[0].slice(0, 12);
    await env.DB.prepare('INSERT INTO hits (ts,type,code,pid,name,country,city,device,browser,os,ref,lang,vid,bot) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(Date.now(), ev.type, ev.code || '', ev.pid || '', ev.name || '', cf.country || '', cf.city || '', device, browser, os, ref, lang, vid, bot).run();
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

function bars(rows, label = r => r.k) {
  const max = Math.max(1, ...rows.map(r => r.c));
  if (!rows.length) return '<p class="mute">데이터가 없습니다</p>';
  return rows.map(r => `<div class="row"><span class="lb">${esc(label(r))}</span><span class="bar"><i style="width:${Math.round(r.c / max * 100)}%"></i></span><b>${num(r.c)}</b></div>`).join('');
}

export async function admin(req, env, url) {
  const head = { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' };
  if (!env.ADMIN_PASSWORD) return new Response('<meta charset="utf-8"><body style="font-family:sans-serif;padding:40px">통계 페이지를 쓰려면 GitHub 시크릿 ADMIN_PASSWORD를 등록하고 다시 배포하세요.', { status: 503, headers: head });
  if (!authed(req, env)) return new Response('로그인이 필요합니다', { status: 401, headers: { ...head, 'www-authenticate': 'Basic realm="stats", charset="UTF-8"' } });
  if (!env.DB) return new Response('D1 데이터베이스가 연결되지 않았습니다', { status: 500, headers: head });
  await init(env);
  await initCommunity(env);

  if (req.method === 'POST') {
    const b = await req.json().catch(() => ({}));
    if (b.a === 'del' && (b.t === 'posts' || b.t === 'comments') && Number(b.id)) { await removeRow(env, b.t, Number(b.id)); return new Response('{"ok":true}', { headers: head }); }
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
  const [tot, daily, hourly, top, country, city, device, browser, os, ref, recent, bots] = await Promise.all([
    q(env, `SELECT SUM(type='view') v, COUNT(DISTINCT CASE WHEN type='view' THEN vid END) u, SUM(type='click') c, COUNT(DISTINCT CASE WHEN type='click' THEN vid END) cu FROM hits ${W}`, since),
    q(env, `SELECT date(${KST},'unixepoch') d, SUM(type='view') v, SUM(type='click') c FROM hits ${W} GROUP BY d ORDER BY d`, since),
    q(env, `SELECT CAST(strftime('%H',${KST},'unixepoch') AS INTEGER) h, COUNT(*) c FROM hits ${W} AND type='view' GROUP BY h`, since),
    q(env, `SELECT pid, name, code, COUNT(*) c FROM hits ${W} AND type='click' GROUP BY pid ORDER BY c DESC LIMIT 15`, since),
    q(env, `SELECT CASE WHEN country='' THEN '알 수 없음' ELSE country END k, COUNT(*) c FROM hits ${W} AND type='view' GROUP BY k ORDER BY c DESC LIMIT 10`, since),
    q(env, `SELECT CASE WHEN city='' THEN '알 수 없음' ELSE city END k, COUNT(*) c FROM hits ${W} AND type='view' GROUP BY k ORDER BY c DESC LIMIT 10`, since),
    q(env, `SELECT device k, COUNT(*) c FROM hits ${W} AND type='view' GROUP BY k ORDER BY c DESC`, since),
    q(env, `SELECT browser k, COUNT(*) c FROM hits ${W} AND type='view' GROUP BY k ORDER BY c DESC LIMIT 8`, since),
    q(env, `SELECT os k, COUNT(*) c FROM hits ${W} AND type='view' GROUP BY k ORDER BY c DESC LIMIT 8`, since),
    q(env, `SELECT CASE WHEN ref='' THEN '직접 접속' ELSE ref END k, COUNT(*) c FROM hits ${W} AND type='view' GROUP BY k ORDER BY c DESC LIMIT 10`, since),
    q(env, 'SELECT * FROM hits WHERE bot=0 ORDER BY ts DESC LIMIT 40'),
    q(env, 'SELECT COUNT(*) c FROM hits WHERE bot=1 AND ts>=?', since)
  ]);
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

  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>통계 | 쁘띠.끄</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>
:root{--bg:#120c10;--card:#1d1419;--line:#33232c;--ink:#fbeef3;--mute:#a58f9a;--p1:#ff4d8d;--p2:#ff8a5c;--p3:#8b5cf6}
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
<header><h1>쁘띠.끄 <span>통계</span></h1><nav class="tabs">${tabs}</nav></header>
<section class="kpis">
<div class="kpi"><b>${num(t.v)}</b><span>방문 (페이지뷰)</span></div>
<div class="kpi"><b>${num(t.u)}</b><span>방문자 (일 기준)</span></div>
<div class="kpi"><b>${num(t.c)}</b><span>상품 클릭</span></div>
<div class="kpi"><b>${ctr}%</b><span>클릭률</span></div>
<div class="kpi"><b>${num(bots[0] && bots[0].c)}</b><span>제외된 봇</span></div>
</section>
<section class="box"><h2>일별 추이 (한국시간)</h2><div class="legend"><i style="background:var(--p3)"></i>방문<i style="background:var(--p1)"></i>클릭</div>${chart}</section>
<section class="grid" style="margin-top:12px">
<div class="box"><h2>인기 상품 클릭 TOP</h2>${bars(top, r => `${r.code} ${r.name}`)}</div>
<div class="box"><h2>시간대별 방문</h2>${hours}</div>
<div class="box"><h2>유입 경로</h2>${bars(ref)}</div>
<div class="box"><h2>국가</h2>${bars(country)}</div>
<div class="box"><h2>도시</h2>${bars(city)}</div>
<div class="box"><h2>기기</h2>${bars(device)}</div>
<div class="box"><h2>브라우저</h2>${bars(browser)}</div>
<div class="box"><h2>운영체제</h2>${bars(os)}</div>
</section>
<section class="box"><h2>최근 활동</h2><div class="wrap"><table><tr><th>시간</th><th>구분</th><th>내용</th><th>지역</th><th>기기</th><th>브라우저</th><th>OS</th><th>유입</th></tr>
${recent.map(r => `<tr><td>${kst(r.ts)}</td><td><span class="tag ${r.type}">${r.type === 'click' ? '클릭' : '방문'}</span></td><td>${esc(r.type === 'click' ? `${r.code} ${r.name}`.slice(0, 40) : '메인')}</td><td>${esc(`${r.country} ${r.city}`.trim())}</td><td>${esc(r.device)}</td><td>${esc(r.browser)}</td><td>${esc(r.os)}</td><td>${esc(r.ref || '직접')}</td></tr>`).join('') || '<tr><td colspan="8" class="mute">기록이 없습니다</td></tr>'}
</table></div></section>
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
async function post(b){const r=await fetch('/0',{method:'POST',body:JSON.stringify(b)});if(!r.ok){alert('실패했습니다');return false}return true}
async function del(t,id){if(confirm('삭제할까요?')&&await post({a:'del',t,id}))location.reload()}
async function notice(){const t=document.getElementById('nt').value,b=document.getElementById('nb').value;if(await post({a:'notice',title:t,body:b}))location.reload()}
</script>
<p class="mute" style="margin-top:16px">원본 IP는 저장하지 않고 일 단위로 섞은 해시만 사용합니다. 봇은 통계에서 제외됩니다.</p>
</body></html>`;
  return new Response(html, { headers: head });
}

// 최근 7일 실제 클릭 수 (봇 제외)
export async function clickCounts(env) {
  try {
    await init(env);
    const rows = await q(env, "SELECT pid, COUNT(*) c FROM hits WHERE type='click' AND bot=0 AND ts>? AND pid<>'' GROUP BY pid", Date.now() - 7 * 86400e3);
    return Object.fromEntries(rows.map(r => [r.pid, r.c]));
  } catch (e) { return {}; }
}
