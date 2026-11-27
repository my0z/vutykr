// 클릭 점검: 사이트별 D1 의 클릭 기록을 날짜 · 나라 · 브라우저 · 머문 시간 기준으로 모아 보여 준다 (IP 는 찍지 않는다 · 공개 저장소 로그)
const { CLOUDFLARE_API_TOKEN: T, CLOUDFLARE_ACCOUNT_ID: A } = process.env;
const api = (p, o = {}) => fetch(`https://api.cloudflare.com/client/v4/accounts/${A}${p}`, { ...o, headers: { authorization: `Bearer ${T}`, 'content-type': 'application/json' } }).then(r => r.json());
const since = Date.now() - 7 * 864e5;
const Q = {
  '날짜별 클릭(한국시간)': `SELECT date(ts/1000,'unixepoch','+9 hours') d, COUNT(*) n, COUNT(DISTINCT iph) ip FROM hits WHERE type='click' AND bot=0 AND ts>${since} GROUP BY d ORDER BY d DESC`,
  '날짜별 방문': `SELECT date(ts/1000,'unixepoch','+9 hours') d, COUNT(*) n, COUNT(DISTINCT iph) ip FROM hits WHERE type='view' AND bot=0 AND ts>${since} GROUP BY d ORDER BY d DESC`,
  '클릭 나라 기기 브라우저': `SELECT country, device, browser, os, COUNT(*) n FROM hits WHERE type='click' AND bot=0 AND ts>${since} GROUP BY 1,2,3,4 ORDER BY n DESC LIMIT 15`,
  '클릭 유입 경로': `SELECT ref, COUNT(*) n FROM hits WHERE type='click' AND bot=0 AND ts>${since} GROUP BY 1 ORDER BY n DESC LIMIT 10`,
  '한 IP 의 클릭 수 분포': `SELECT c, COUNT(*) ips FROM (SELECT iph, COUNT(*) c FROM hits WHERE type='click' AND bot=0 AND ts>${since} GROUP BY iph) GROUP BY c ORDER BY c`,
  '클릭 망(ASN) 상위': `SELECT asn, bot, COUNT(*) n FROM hits WHERE type='click' AND ts>${since} GROUP BY 1,2 ORDER BY n DESC LIMIT 15`,
  '클릭 도시 상위': `SELECT city, COUNT(*) n FROM hits WHERE type='click' AND bot=0 AND ts>${since} GROUP BY 1 ORDER BY n DESC LIMIT 10`
};
const dbs = ((await api('/d1/database?per_page=50')).result || []);
for (const db of dbs) {
  console.log(`\n######## ${db.name}`);
  await api(`/d1/database/${db.uuid}/query`, { method: 'POST', body: JSON.stringify({ sql: 'ALTER TABLE hits ADD COLUMN asn TEXT' }) }).catch(() => {}); // 망 이름 열이 없으면 만든다 (있으면 오류만 나고 넘어간다)
  for (const [k, sql] of Object.entries(Q)) {
    const r = await api(`/d1/database/${db.uuid}/query`, { method: 'POST', body: JSON.stringify({ sql }) });
    const rows = r.result && r.result[0] && r.result[0].results;
    console.log(`-- ${k}`); console.log(rows ? rows.map(x => Object.values(x).join(' | ')).join('\n') || '(없음)' : JSON.stringify(r.errors || r).slice(0, 200));
  }
}
