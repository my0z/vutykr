// 쿠팡으로 넘어가기 전에 보여 주는 안내 페이지 (소개만 하는 사이트라는 안내와 수수료 문구를 보여 주고 5초 뒤 이동한다)
import { DISC } from '../sites/index.js';
import { themeCss, logoSvg } from './shell.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SECONDS = 5;

export function goPage(site, code, p) {
  const go = `/${code}?go=1`;
  const name = esc(site.name);
  const price = p && p.price ? `${Number(p.price).toLocaleString('ko-KR')}원` : '';
  const prod = p
    ? `<div class="pd">${p.image ? `<img src="${esc(p.image)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}<div><b>${esc(p.name)}</b>${price ? `<span>${price}</span>` : ''}</div></div>`
    : '';
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${name} | 쿠팡으로 이동합니다</title>
<noscript><meta http-equiv="refresh" content="${SECONDS};url=${go}"></noscript>
<style>${themeCss(site.theme)}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font-family:Pretendard Variable,Pretendard,-apple-system,'Noto Sans KR',system-ui,sans-serif;padding:16px}
.card{width:min(460px,100%);background:var(--card);border:1px solid var(--line);border-radius:22px;padding:26px 22px;box-shadow:var(--shadow);text-align:center}
.lg{font-weight:900;font-size:1.35rem;letter-spacing:-.03em}.lg .mk{width:1.25em;height:1.25em;vertical-align:-.26em;margin-right:.12em}
h1{font-size:1.12rem;margin:14px 0 6px;letter-spacing:-.02em}.sub{color:var(--mute);font-size:.86rem;line-height:1.6;margin:0 0 14px}
.pd{display:flex;gap:12px;align-items:center;text-align:left;background:var(--soft);border-radius:14px;padding:10px;margin:0 0 14px}
.pd img{width:72px;height:72px;object-fit:cover;border-radius:10px;background:#fff;flex:none}.pd b{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:.86rem;line-height:1.4}.pd span{display:block;margin-top:4px;font-weight:900;color:var(--p1)}
.note{background:var(--soft);border:1.5px solid var(--p1);border-radius:14px;padding:12px 14px;font-size:.84rem;line-height:1.6;text-align:left;margin:0 0 10px}.note b{color:var(--p1)}
.fee{color:var(--mute);font-size:.78rem;line-height:1.55;margin:0 0 16px}
.bar{height:6px;border-radius:99px;background:var(--line);overflow:hidden;margin:0 0 8px}.bar i{display:block;height:100%;width:0;background:var(--grad);transition:width 1s linear}
.cd{font-size:.86rem;color:var(--mute);margin:0 0 14px}.cd b{color:var(--p1);font-size:1rem}
.btn{display:block;padding:14px;border-radius:14px;font-weight:900;text-decoration:none;font-size:1rem}.go{background:var(--grad);color:#fff}.bk{margin-top:8px;color:var(--mute);font-size:.84rem;font-weight:700}
</style></head><body><main class="card">
<div class="lg">${logoSvg(site, 'var(--p1)', 'var(--p2)')}${name}</div>
<h1>쿠팡으로 이동합니다</h1>
<p class="sub">아래 상품 페이지로 연결해 드려요</p>
${prod}
<div class="note"><b>안내</b> ${name}은 상품을 소개만 하는 사이트예요. 상품 판매와 배송과 교환과 환불은 쿠팡에서 직접 처리하며 ${name}은 판매 당사자가 아닙니다.</div>
<p class="fee">${esc(DISC)}</p>
<div class="bar"><i id="b"></i></div>
<p class="cd"><b id="n">${SECONDS}</b>초 뒤에 자동으로 이동합니다</p>
<a class="btn go" id="g" href="${go}" rel="sponsored nofollow noopener">바로 쿠팡으로 가기 →</a>
<a class="btn bk" href="#" onclick="history.length>1?history.back():location.href='/';return false">돌아가기</a>
</main>
<script>(function(){var s=${SECONDS},n=document.getElementById('n'),b=document.getElementById('b'),g=document.getElementById('g').href,t=s,m=0;
requestAnimationFrame(function(){b.style.width='100%';b.style.transitionDuration=s+'s'});
var i=setInterval(function(){t--;n.textContent=Math.max(t,0);if(t<=0&&!m){m=1;clearInterval(i);location.replace(g)}},1000)})();</script>
</body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex,nofollow' } });
}
