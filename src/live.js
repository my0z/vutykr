// 매시간 만드는 실시간 배너: 만든 그림은 KV(기본 저장소)에 두고 여기서 내보낸다. 목록은 live:index 에 있다
import { SITES } from '../sites/index.js';

const json = (o, extra = {}) => new Response(JSON.stringify(o), { headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', ...extra } });

export async function liveRoute(url, env) {
  const kv = env.DATA;
  if (!kv) return null;
  const m = url.pathname.match(/^\/live\/([A-Za-z0-9]+)-(w|n)\.webp$/);
  if (m) {
    const buf = await kv.get(`live:img:${m[1]}-${m[2]}`, 'arrayBuffer');
    if (!buf) return new Response('없음', { status: 404 });
    return new Response(buf, { headers: { 'content-type': 'image/webp', 'cache-control': 'public,max-age=86400,immutable', 'access-control-allow-origin': '*' } });
  }
  if (url.pathname === '/api/live') {
    let idx = [];
    try { idx = JSON.parse((await kv.get('live:index')) || '[]'); } catch (e) {}
    const items = idx.filter(b => SITES[b.site]).map(b => ({ id: b.id, site: b.site, text: b.text, url: b.url, host: SITES[b.site].host, live: true }));
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
  await Promise.all([kv.delete(`live:img:${id}-w`), kv.delete(`live:img:${id}-n`)]);
  if (hit.src) {
    let block = [];
    try { block = JSON.parse((await kv.get('live:block')) || '[]'); } catch (e) {}
    if (!block.includes(hit.src)) { block.push(hit.src); await kv.put('live:block', JSON.stringify(block.slice(-3000))); }
  }
  return true;
}
