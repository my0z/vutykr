// 하루 한 번 사이트와 배너 상태를 모아 작업 요약에 적는다 (죽은 링크도 확인)
import { SITES } from '../sites/index.js';
import { appendFileSync } from 'node:fs';
const out = []; const say = s => { out.push(s); console.log(s); };
const live = await (await fetch('https://vuty.kr/api/live')).json();
const by = {}; for (const x of live) { const k = x.site || '?'; by[k] = by[k] || { n: 0, v: 0 }; by[k].n++; if (x.video) by[k].v++; }
say(`## 실시간 배너 ${live.length}개 (영상 ${live.filter(x => x.video).length}개)`);
for (const [k, v] of Object.entries(by)) say(`- ${k}: ${v.n}개 · 영상 ${v.v}개`);
say('## 사이트 상태');
let bad = 0;
for (const [id, s] of Object.entries(SITES).filter(([, x]) => !x.draft)) {
  const urls = [s.host + '/', s.host + '/sitemap.xml', ...Object.keys(s.cats || {}).slice(0, 3).map(c => `${s.host}/c/${encodeURIComponent(c)}`)];
  for (const u of urls) {
    let st = 0; // 한 번 실패하면 잠시 뒤 한 번 더 확인한다 (일시 오류와 진짜 오류를 가른다)
    for (let t = 0; t < 2 && st !== 200; t++) {
      try { st = (await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36' }, redirect: 'follow' })).status; } catch (e) { st = -1; }
      if (st !== 200) await new Promise(r => setTimeout(r, 4000));
    }
    if (st !== 200) { bad++; say(`- 오류 ${st} ${u}`); }
  }
}
say(bad ? `점검 결과: 문제 ${bad}건` : '점검 결과: 이상 없음');
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, out.join('\n') + '\n');
if (bad) process.exit(1);
