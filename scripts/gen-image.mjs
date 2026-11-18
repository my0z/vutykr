// 실사 이미지 만들기 (Cloudflare Workers AI 무료 한도 사용)
// 사용법: node scripts/gen-image.mjs "프롬프트" 출력.jpg [모델] [가로] [세로]
// 모델: dev (FLUX.2 dev 기본) | klein (FLUX.2 klein 9B) | lucid | phoenix
// 필요: 환경변수 CLOUDFLARE_API_TOKEN (Workers AI 권한 포함) 와 CLOUDFLARE_ACCOUNT_ID
// 팁: 인위적으로 보이면 프롬프트에 "candid unedited smartphone photo / visible skin pores / no makeup / slight film grain / not a studio portrait" 를 넣는다
import { writeFileSync } from 'node:fs';

const MODELS = { dev: '@cf/black-forest-labs/flux-2-dev', klein: '@cf/black-forest-labs/flux-2-klein-9b', lucid: '@cf/leonardo/lucid-origin', phoenix: '@cf/leonardo/phoenix-1.0' };
const [prompt, out = 'image.jpg', key = 'dev', w = '1024', h = '1024'] = process.argv.slice(2);
const token = process.env.CLOUDFLARE_API_TOKEN;
const acct = process.env.CLOUDFLARE_ACCOUNT_ID || '709dcc6af36c8ee7b6d3d99e7a9fe422';
const model = MODELS[key];
if (!prompt || !token || !model) { console.log('사용법: node scripts/gen-image.mjs "프롬프트" 출력.jpg [dev|klein|lucid|phoenix] [가로] [세로] (CLOUDFLARE_API_TOKEN 필요)'); process.exit(1); }

const url = `https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/${model}`;
let r;
if (key === 'dev' || key === 'klein') { // FLUX.2 는 multipart 로 보낸다
  const f = new FormData(); f.append('prompt', prompt); f.append('width', w); f.append('height', h);
  r = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: f });
} else {
  r = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ prompt, width: Number(w), height: Number(h) }) });
}
if ((r.headers.get('content-type') || '').startsWith('image/')) { writeFileSync(out, Buffer.from(await r.arrayBuffer())); console.log('저장:', out); process.exit(0); }
const j = await r.json();
const b64 = j.result && j.result.image;
if (!b64) { console.log('실패:', JSON.stringify(j.errors || j).slice(0, 300)); process.exit(1); }
writeFileSync(out, Buffer.from(b64, 'base64'));
console.log('저장:', out);
