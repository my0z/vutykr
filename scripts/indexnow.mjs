// 사이트맵의 주소를 IndexNow 로 검색엔진에 알린다 (키 파일은 각 사이트의 /<키>.txt 가 돌려준다)
import { SITES } from '../sites/index.js';
const KEY = process.env.INDEXNOW_KEY;
for (const s of Object.values(SITES)) {
  try {
    const host = new URL(s.host).hostname;
    const xml = await (await fetch(s.host + '/sitemap.xml', { headers: { 'user-agent': 'Mozilla/5.0 indexnow' } })).text();
    const urlList = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]).slice(0, 200);
    if (!urlList.length) { console.log('주소 없음', host); continue; }
    const r = await fetch('https://api.indexnow.org/indexnow', { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ host, key: KEY, keyLocation: `${s.host}/${KEY}.txt`, urlList }) });
    console.log(host, urlList.length + '개', r.status);
  } catch (e) { console.log('실패', s.host, e.message); }
}
