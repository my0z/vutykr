// KV 의 글과 목록 같은 작은 값을 JSON 한 파일로 내려받는다 (배너 그림과 영상은 크고 다시 만들 수 있어 뺀다)
const TOKEN = process.env.CLOUDFLARE_API_TOKEN, ACCT = process.env.CLOUDFLARE_ACCOUNT_ID || '709dcc6af36c8ee7b6d3d99e7a9fe422', NS = process.env.KV_NAMESPACE_ID || '8bdd6ff58a6248e0b310bf0d2e5235c6';
import { writeFileSync, mkdirSync } from 'node:fs';
const base = `https://api.cloudflare.com/client/v4/accounts/${ACCT}/storage/kv/namespaces/${NS}`, h = { authorization: `Bearer ${TOKEN}` };
const keys = []; let cursor = '';
do {
  const r = await (await fetch(`${base}/keys?limit=1000${cursor ? '&cursor=' + cursor : ''}`, { headers: h })).json();
  if (!r.success) { console.log('키 목록 실패', JSON.stringify(r.errors)); process.exit(1); }
  keys.push(...r.result.map(x => x.name)); cursor = r.result_info && r.result_info.cursor || '';
} while (cursor);
const small = keys.filter(k => !/^live:(img|vid):/.test(k));
const out = {};
for (const k of small) { const r = await fetch(`${base}/values/${encodeURIComponent(k)}`, { headers: h }); out[k] = r.ok ? await r.text() : null; }
mkdirSync('backup', { recursive: true });
const file = `backup/kv-${new Date().toISOString().slice(0, 10)}.json`;
writeFileSync(file, JSON.stringify(out));
console.log('전체 키', keys.length, '저장한 키', small.length, file);
