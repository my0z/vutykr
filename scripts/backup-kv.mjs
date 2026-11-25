// 모든 사이트의 KV(글과 상품과 목록 같은 작은 값)를 JSON 한 파일로 내려받는다 (배너 그림과 영상은 크고 다시 만들 수 있어 뺀다)
import { writeFileSync, mkdirSync } from 'node:fs';
const TOKEN = process.env.CLOUDFLARE_API_TOKEN, ACCT = process.env.CLOUDFLARE_ACCOUNT_ID || '709dcc6af36c8ee7b6d3d99e7a9fe422';
const h = { authorization: `Bearer ${TOKEN}` }, api = `https://api.cloudflare.com/client/v4/accounts/${ACCT}/storage/kv/namespaces`;
const LEGACY = { 'bodcar-data': '4b3dac6e9e96425294eaa77e5c5868af', 'seareal-data': '2441ede566d64ade8c730331a0d759ad' }; // 옛 이름으로 만든 두 사이트 저장소
const list = await (await fetch(`${api}?per_page=100`, { headers: h })).json();
if (!list.success) { console.log('저장소 목록 실패', JSON.stringify(list.errors)); process.exit(1); }
const targets = Object.fromEntries(list.result.filter(n => /^(vutykr-data|new-usb-posts)/.test(n.title)).map(n => [n.title, n.id]));
for (const [t, id] of Object.entries(LEGACY)) targets[t] = targets[t] || id;
const out = {}; let total = 0;
for (const [title, ns] of Object.entries(targets)) {
  const keys = []; let cursor = '';
  do {
    const r = await (await fetch(`${api}/${ns}/keys?limit=1000${cursor ? '&cursor=' + cursor : ''}`, { headers: h })).json();
    if (!r.success) { console.log('키 목록 실패', title, JSON.stringify(r.errors)); process.exit(1); }
    keys.push(...r.result.map(x => x.name)); cursor = r.result_info && r.result_info.cursor || '';
  } while (cursor);
  const small = keys.filter(k => !/^live:(img|vid):/.test(k));
  out[title] = {};
  for (const k of small) { const r = await fetch(`${api}/${ns}/values/${encodeURIComponent(k)}`, { headers: h }); out[title][k] = r.ok ? await r.text() : null; }
  total += small.length;
  console.log(title, '전체 키', keys.length, '저장', small.length);
}
mkdirSync('backup', { recursive: true });
const file = `backup/kv-${new Date().toISOString().slice(0, 10)}.json`;
writeFileSync(file, JSON.stringify(out));
console.log('저장소', Object.keys(out).length, '키', total, file);
