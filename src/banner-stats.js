// 배너별 노출과 클릭 통계: 사이트들이 보낸 신호를 한 곳(기본 D1)에 모아 /0/bn 화면에서 본다
import { SITES, PROMOS } from '../sites/index.js';

const KST = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const ID = /^[a-z]\d{6,10}[A-Za-z0-9]{0,8}$|^[a-z]\d{1,3}$/; // 실시간 배너(예 v26112520VTP)와 고정 배너(예 g1)
const BOT = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|monitor|uptime|preview|curl|wget|python|node|playwright|puppeteer/i;
const SQL_INIT = 'CREATE TABLE IF NOT EXISTS bn(id TEXT, day TEXT, host TEXT, v INTEGER DEFAULT 0, c INTEGER DEFAULT 0, PRIMARY KEY(id, day, host))';
const SQL_UP = 'INSERT INTO bn(id,day,host,v,c) VALUES(?,?,?,?,?) ON CONFLICT(id,day,host) DO UPDATE SET v=v+excluded.v, c=c+excluded.c';

// 브라우저가 배너를 보여 주거나 눌렀을 때 보내는 신호 (usb.kr 에서도 보낸다)
export async function bnBeacon(req, env, ctx) {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400' };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: cors });
  const done = new Response(null, { status: 204, headers: cors });
  if (!env.DB || BOT.test(req.headers.get('user-agent') || '')) return done;
  let b; try { b = JSON.parse((await req.text()).slice(0, 200)); } catch (e) { return done; }
  const id = String(b.i || ''), click = b.e === 'c';
  if (!ID.test(id)) return done;
  let host = ''; try { host = new URL(req.headers.get('origin') || '').hostname; } catch (e) {}
  host = (host || new URL(req.url).hostname).replace(/^www\./, '').slice(0, 40);
  const args = [id, KST(), host, click ? 0 : 1, click ? 1 : 0];
  ctx.waitUntil(env.DB.prepare(SQL_UP).bind(...args).run().catch(() => env.DB.prepare(SQL_INIT).run().then(() => env.DB.prepare(SQL_UP).bind(...args).run())).catch(() => {}));
  return done;
}

export async function bnPrune(env) {
  try { await env.DB.prepare('DELETE FROM bn WHERE day<?').bind(new Date(Date.now() + 9 * 3600e3 - 90 * 86400e3).toISOString().slice(0, 10)).run(); } catch (e) {}
}

const catOf = u => { try { return decodeURIComponent(String(u || '').split('/c/')[1] || '').split('?')[0]; } catch (e) { return ''; } };

// 기간(일)과 함께 배너별 숫자와 합계를 만든다. d=0 이면 전체 기간
export async function bnData(env, d) {
  const since = d ? new Date(Date.now() + 9 * 3600e3 - (d - 1) * 86400e3).toISOString().slice(0, 10) : '0000-00-00';
  let rows = [], hosts = [];
  try {
    await env.DB.prepare(SQL_INIT).run();
    rows = (await env.DB.prepare('SELECT id, SUM(v) v, SUM(c) c FROM bn WHERE day>=? GROUP BY id').bind(since).all()).results || [];
    hosts = (await env.DB.prepare('SELECT host, SUM(v) v, SUM(c) c FROM bn WHERE day>=? GROUP BY host ORDER BY v DESC').bind(since).all()).results || [];
  } catch (e) {}
  let idx = []; try { idx = JSON.parse((await env.G.get('live:index')) || '[]'); } catch (e) {}
  const meta = new Map(idx.map(x => [x.id, { id: x.id, site: x.site, text: x.text, cat: catOf(x.url), video: !!x.video, ts: x.ts || 0, live: true }]));
  for (const p of PROMOS) if (!meta.has(p.id)) meta.set(p.id, { id: p.id, site: p.site, text: p.text, cat: catOf(p.url), video: false, ts: 0, live: false });
  const stat = new Map(rows.map(r => [r.id, r]));
  const items = [];
  for (const m of meta.values()) { // 신호가 하나도 없는 배너도 보여 준다 (노출 0)
    const s = stat.get(m.id) || { v: 0, c: 0 };
    items.push({ ...m, v: s.v || 0, c: s.c || 0 });
  }
  for (const r of rows) if (!meta.has(r.id)) items.push({ id: r.id, site: '', text: '(지워진 배너)', cat: '', video: false, ts: 0, live: false, gone: true, v: r.v || 0, c: r.c || 0 });
  const sum = list => list.reduce((a, x) => ({ v: a.v + x.v, c: a.c + x.c }), { v: 0, c: 0 });
  const live = items.filter(x => x.live || x.gone);
  const bySite = {};
  for (const x of items) { if (!x.site) continue; const a = bySite[x.site] || (bySite[x.site] = { site: x.site, name: (SITES[x.site] && SITES[x.site].name) || x.site, v: 0, c: 0, n: 0 }); a.v += x.v; a.c += x.c; a.n++; }
  return {
    d, now: Date.now(), items,
    total: sum(items), video: sum(live.filter(x => x.video)), image: sum(live.filter(x => !x.video && x.live)),
    bySite: Object.values(bySite).sort((a, b) => b.v - a.v), hosts
  };
}

// 사람이 보기 편한 화면: 합계 카드 + 사이트별 막대 + 정렬 가능한 배너 카드
export function bnPage(data) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>배너 통계</title>
<style>
:root{--bg:#f4f6fa;--card:#fff;--ink:#17202e;--mute:#6b7686;--line:#e3e8f0;--p:#0b5fff;--ok:#16a34a;--warn:#ea580c}
@media(prefers-color-scheme:dark){:root{--bg:#0f141c;--card:#18202b;--ink:#eaf0f8;--mute:#93a0b4;--line:#263243}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 'Noto Sans KR',system-ui,sans-serif}
.w{max-width:1180px;margin:0 auto;padding:18px 14px 60px}
h1{font-size:1.35rem;margin:6px 0 14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}h1 a{font-size:.85rem;font-weight:500;color:var(--p);text-decoration:none}
.tabs{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 14px}.tabs a,.tabs button{padding:7px 14px;border-radius:99px;border:1px solid var(--line);background:var(--card);color:var(--ink);text-decoration:none;font:inherit;font-size:.88rem;cursor:pointer}
.tabs .on{background:var(--p);color:#fff;border-color:var(--p)}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px}.kpi b{display:block;font-size:1.6rem;line-height:1.2}.kpi span{color:var(--mute);font-size:.82rem}.kpi small{display:block;margin-top:4px;color:var(--mute)}
.box{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px;margin-bottom:14px}.box h2{font-size:1rem;margin:0 0 10px}
.bar{display:grid;grid-template-columns:110px 1fr 120px;gap:10px;align-items:center;margin:7px 0;font-size:.88rem}.bar i{display:block;height:10px;border-radius:6px;background:var(--p);min-width:2px}.bar em{font-style:normal;color:var(--mute);text-align:right}
.tools{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 12px;align-items:center}.tools select{padding:7px 10px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--ink);font:inherit}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden}.card img{display:block;width:100%;aspect-ratio:16/5;object-fit:cover;background:#ccd}
.card .in{padding:11px 12px}.card .t{font-weight:600;font-size:.92rem;margin:0 0 2px}.card .m{color:var(--mute);font-size:.78rem}
.nums{display:flex;gap:14px;margin-top:8px;font-size:.85rem}.nums b{font-size:1.05rem}.ctr{margin-left:auto;font-weight:700}.ctr.hi{color:var(--ok)}.ctr.lo{color:var(--warn)}.ctr.na{color:var(--mute);font-weight:400}
.tag{display:inline-block;padding:1px 8px;border-radius:99px;font-size:.72rem;background:var(--line);margin-right:4px}.tag.v{background:#ede9fe;color:#6d28d9}
.mute{color:var(--mute)}
@media(max-width:560px){.bar{grid-template-columns:80px 1fr 90px}}
</style></head><body><div class="w">
<h1>배너 통계 <a href="/0">← 사이트 통계</a></h1>
<div class="tabs" id="range"></div>
<div class="kpis" id="kpis"></div>
<div class="box"><h2>배너를 만든 사이트별</h2><div id="bysite"></div></div>
<div class="box"><h2>배너가 보인 사이트별</h2><div id="hosts"></div></div>
<div class="tools"><b>배너 <span id="cnt"></span></b>
<select id="sort"><option value="ts">최근 만든 순</option><option value="v">노출 많은 순</option><option value="c">클릭 많은 순</option><option value="r">클릭률 높은 순</option></select>
<select id="kind"><option value="">영상과 이미지</option><option value="v">영상만</option><option value="i">이미지만</option></select>
<select id="site"><option value="">모든 사이트</option></select>
<label class="mute"><input type="checkbox" id="seen"> 노출된 것만</label></div>
<div class="grid" id="grid"></div>
<p class="mute" style="margin-top:18px">노출은 배너가 화면에 뜬 횟수이고 클릭은 배너를 누른 횟수입니다. 봇과 크롤러는 뺍니다. 노출이 20회 미만이면 클릭률은 표본이 적어 참고만 하세요. 통계는 오늘부터 쌓입니다.</p>
</div>
<script>
var D=${json};
var $=function(i){return document.getElementById(i)},n=function(x){return Number(x||0).toLocaleString('ko-KR')},pc=function(c,v){return v?(c/v*100).toFixed(1)+'%':'-'},esc=function(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})};
var R=[[1,'오늘'],[7,'7일'],[30,'30일'],[0,'전체']];
$('range').innerHTML=R.map(function(r){return '<a class="'+(D.d===r[0]?'on':'')+'" href="?d='+r[0]+'">'+r[1]+'</a>'}).join('');
function kpi(b,s,sm){return '<div class="kpi"><span>'+s+'</span><b>'+b+'</b>'+(sm?'<small>'+sm+'</small>':'')+'</div>'}
var t=D.total,vv=D.video,im=D.image;
$('kpis').innerHTML=kpi(n(t.v),'노출')+kpi(n(t.c),'클릭')+kpi(pc(t.c,t.v),'클릭률')+kpi(pc(vv.c,vv.v),'영상 클릭률','노출 '+n(vv.v)+' · 클릭 '+n(vv.c))+kpi(pc(im.c,im.v),'이미지 클릭률','노출 '+n(im.v)+' · 클릭 '+n(im.c));
function bars(list,key,name){var mx=Math.max.apply(null,[1].concat(list.map(function(x){return x.v})));return list.length?list.map(function(x){return '<div class="bar"><span>'+esc(name(x))+'</span><span><i style="width:'+Math.max(1,x.v/mx*100)+'%"></i></span><em>'+n(x.v)+' · '+n(x.c)+' · '+pc(x.c,x.v)+'</em></div>'}).join(''):'<p class="mute">아직 데이터가 없습니다</p>'}
$('bysite').innerHTML=bars(D.bySite,'site',function(x){return x.name});
$('hosts').innerHTML=bars(D.hosts,'host',function(x){return x.host});
var sites=D.bySite.map(function(x){return x.site});
$('site').innerHTML+=D.bySite.map(function(x){return '<option value="'+x.site+'">'+esc(x.name)+'</option>'}).join('');
function ago(ts){if(!ts)return '고정 배너';var m=Math.round((D.now-ts)/60000);return m<60?m+'분 전':m<1440?Math.round(m/60)+'시간 전':Math.round(m/1440)+'일 전'}
function render(){
  var k=$('kind').value,s=$('site').value,seen=$('seen').checked,o=$('sort').value;
  var L=D.items.filter(function(x){return(!k||(k==='v')===x.video)&&(!s||x.site===s)&&(!seen||x.v>0)});
  L.sort(function(a,b){return o==='ts'?b.ts-a.ts:o==='v'?b.v-a.v:o==='c'?b.c-a.c:((b.v>=20?b.c/b.v:-1)-(a.v>=20?a.c/a.v:-1))});
  $('cnt').textContent='('+n(L.length)+'개)';
  $('grid').innerHTML=L.slice(0,120).map(function(x){
    var base=x.live?'/live/':'/promo/',ctr=x.v>=20?x.c/x.v*100:null,cls=ctr==null?'na':ctr>=5?'hi':ctr<1?'lo':'';
    return '<div class="card">'+(x.gone?'':'<img loading="lazy" src="'+base+x.id+'-n.webp" alt="">')+'<div class="in"><p class="t">'+esc(x.text||x.id)+'</p><div class="m">'+(x.video?'<span class="tag v">영상</span>':'<span class="tag">이미지</span>')+esc(x.cat)+' · '+esc((sites.indexOf(x.site)>=0?D.bySite[sites.indexOf(x.site)].name:x.site)||'')+' · '+ago(x.ts)+'</div><div class="nums"><span>노출 <b>'+n(x.v)+'</b></span><span>클릭 <b>'+n(x.c)+'</b></span><span class="ctr '+cls+'">'+(ctr==null?(x.v?'표본 적음':'-'):ctr.toFixed(1)+'%')+'</span></div></div></div>'}).join('')||'<p class="mute">조건에 맞는 배너가 없습니다</p>';
}
['sort','kind','site','seen'].forEach(function(i){$(i).addEventListener('change',render)});render();
</script></body></html>`;
}
