// 실사 이미지 만들기 (Cloudflare Workers AI 무료 한도 사용)
// 사용법: node scripts/gen-image.mjs "프롬프트" 출력파일.jpg
// 필요: 환경변수 CLOUDFLARE_API_TOKEN (Workers AI 권한 포함) 와 CLOUDFLARE_ACCOUNT_ID
import { writeFileSync } from 'node:fs';

const [prompt, out = 'image.jpg'] = process.argv.slice(2);
const token = process.env.CLOUDFLARE_API_TOKEN;
const acct = process.env.CLOUDFLARE_ACCOUNT_ID || '709dcc6af36c8ee7b6d3d99e7a9fe422';
if (!prompt || !token) { console.log('사용법: node scripts/gen-image.mjs "프롬프트" 출력.jpg (CLOUDFLARE_API_TOKEN 필요)'); process.exit(1); }

const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/@cf/black-forest-labs/flux-1-schnell`, {
  method: 'POST',
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ prompt, steps: 8 })
});
const j = await r.json();
const b64 = j.result && j.result.image;
if (!b64) { console.log('실패:', JSON.stringify(j.errors || j).slice(0, 300)); process.exit(1); }
writeFileSync(out, Buffer.from(b64, 'base64'));
console.log('저장:', out);
