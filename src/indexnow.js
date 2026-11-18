// IndexNow: 새 페이지나 바뀐 페이지를 빙과 네이버 같은 검색엔진에 바로 알린다 (키 파일은 각 사이트 주소 아래 <키>.txt 로 공개한다)
async function sha(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
export const indexNowKey = async site => (await sha(`indexnow|${site.id}`)).slice(0, 32);

export async function pingIndexNow(site, urls) {
  const list = [...new Set(urls)].slice(0, 100);
  if (!list.length) return 'none';
  const key = await indexNowKey(site);
  const host = new URL(site.host).hostname;
  try {
    const r = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ host, key, keyLocation: `${site.host}/${key}.txt`, urlList: list })
    });
    return r.status;
  } catch (e) { return 'err ' + e.message; }
}
