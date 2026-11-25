// 매시간 만드는 실시간 배너: 만든 그림은 KV(기본 저장소)에 두고 여기서 내보낸다. 목록은 live:index 에 있다
import { SITES } from '../sites/index.js';

const json = (o, extra = {}) => new Response(JSON.stringify(o), { headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', ...extra } });

export async function liveRoute(url, env, req) {
  const kv = env.DATA;
  if (!kv) return null;
  const m = url.pathname.match(/^\/live\/([A-Za-z0-9]+)-(w|n)\.(webp|mp4)$/);
  if (m) {
    const isVid = m[3] === 'mp4';
    const buf = await kv.get(`live:${isVid ? 'vid' : 'img'}:${m[1]}-${m[2]}`, 'arrayBuffer');
    if (!buf) return new Response('없음', { status: 404 });
    const head = { 'content-type': isVid ? 'video/mp4' : 'image/webp', 'cache-control': 'public,max-age=86400,immutable', 'access-control-allow-origin': '*', 'accept-ranges': 'bytes' };
    const rg = isVid && /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') || ''); // 사파리는 영상을 구간 요청으로만 재생한다
    if (rg) {
      const total = buf.byteLength, a = rg[1] === '' ? Math.max(0, total - Number(rg[2])) : Number(rg[1]), b = rg[1] === '' || rg[2] === '' ? total - 1 : Math.min(Number(rg[2]), total - 1);
      if (a > b || a >= total) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${total}` } });
      return new Response(buf.slice(a, b + 1), { status: 206, headers: { ...head, 'content-range': `bytes ${a}-${b}/${total}`, 'content-length': String(b - a + 1) } });
    }
    return new Response(buf, { headers: head });
  }
  if (url.pathname === '/api/live') {
    let idx = [];
    try { idx = JSON.parse((await kv.get('live:index')) || '[]'); } catch (e) {}
    if (idx.length > 200) idx = [...idx.slice(-100), ...idx.slice(0, -100).sort(() => Math.random() - 0.5).slice(0, 100)]; // 많이 쌓이면 최근 100장과 옛 배너 무작위 100장을 보여 준다 (모두 보관한다)
    const items = idx.filter(b => SITES[b.site]).map(b => ({ id: b.id, site: b.site, text: b.text, url: b.url, host: SITES[b.site].host, live: true, ts: b.ts || 0, video: !!b.video, ...(b.pex ? { pex: true } : {}) }));
    return json(items, { 'cache-control': 'public,max-age=300' });
  }
  return null;
}

// 관리자가 이상한 배너를 지운다. 쓴 사진은 다시 안 나오게 차단 목록에 넣는다
export async function liveDelete(kv, id) {
  let idx = [];
  try { idx = JSON.parse((await kv.get('live:index')) || '[]'); } catch (e) {}
  const hit = idx.find(b => b.id === id);
  if (!hit) return false;
  await kv.put('live:index', JSON.stringify(idx.filter(b => b.id !== id)));
  await Promise.all([kv.delete(`live:img:${id}-w`), kv.delete(`live:img:${id}-n`), ...(hit.video ? [kv.delete(`live:vid:${id}-w`), kv.delete(`live:vid:${id}-n`)] : [])]);
  if (hit.src) {
    let block = [];
    try { block = JSON.parse((await kv.get('live:block')) || '[]'); } catch (e) {}
    if (!block.includes(hit.src)) { block.push(hit.src); await kv.put('live:block', JSON.stringify(block.slice(-3000))); }
  }
  return true;
}
