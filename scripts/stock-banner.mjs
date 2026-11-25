// Pixabay 무료 사진으로 배너를 만든다 (이미지 생성 AI 를 쓰지 않아 뉴런 비용이 0 이다)
// 필요: PIXABAY_API_KEY 와 playwright. 환경변수 COUNT (기본 60) 로 전체 장수를 정한다.
// 관련성: 카테고리 대표 낱말로 한국어 검색하고 사진 태그에 그 낱말이 들어 있어야 쓴다. 사람이 나오는 사진은 뺀다.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { SITES } from '../sites/index.js';
import { buildHtml, randomDesign, copyOf } from './banner-design.mjs';

const KEY = process.env.PIXABAY_API_KEY;
if (!KEY) { console.log('PIXABAY_API_KEY 없음'); process.exit(1); }
const COUNT = Number(process.env.COUNT || 60);
const LIST = new URL('../sites/auto-promos.json', import.meta.url);
const USED = new URL('../sites/stock-used.json', import.meta.url);
const OUT = new URL('../public/promo/', import.meta.url);
const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => [...a].sort(() => Math.random() - 0.5);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(2, 10).replace(/-/g, '');
// 왼쪽이 색 바탕이고 글자가 들어가는 배치만 쓴다 (사진 위치를 알 수 없으므로 사진이 왼쪽인 배치는 뺀다)
const LAYOUTS = ['split', 'full', 'light', 'slant', 'glass', 'circle'];
// 뜻이 여러 가지라 엉뚱한 사진이 나오는 낱말은 쓰지 않고 이 검색어로 바꾼다 (카테고리 이름 기준)
const QMAP = {
  관상어: ['열대어', '수족관', '금붕어'], 메이크업: ['화장품', '립스틱', '아이섀도'],
  // 육아 사이트: 사람이 나오는 사진은 거르므로 용품 하나만 찍힌 사진이 나오는 낱말로 찾는다
  기저귀물티슈: ['기저귀', '물티슈'], 분유이유식: ['이유식', '분유'], 수유용품: ['젖병', '유축기'], 유모차카시트: ['유모차', '카시트'],
  아기침구가구: ['아기 침대', '요람', '아기 이불'], 장난감완구: ['딸랑이', '모빌', '치발기', '곰인형', '블록 장난감', '장난감 자동차'],
  아기옷: ['아기 옷', '배냇저고리', '아기 양말', '아기 신발'], 목욕스킨케어: ['아기 로션', '비누', '욕조'], 이유식용품: ['아기 숟가락', '빨대컵', '식판', '하이체어'],
  안전용품: ['안전문', '아기 안전'], 외출용품: ['아기띠', '기저귀 가방', '아기 신발'], 신생아용품: ['속싸개', '손수건', '아기 양말'], 건강위생: ['체온계', '가습기', '손톱가위'],
  바디헤어: ['바디워시', '바디로션', '헤어 에센스'], 장신구: ['목걸이', '귀걸이', '팔찌'],
};
const AMBIG = new Set(['쿠션', '어항', '팩', '배', '차', '밤', '눈', '물']);
const PEOPLE = /사람|여성|여자|남성|남자|소녀|소년|아기|아이|어린이|유아|모델|얼굴|커플|가족|엄마|아빠|초상|신부|신랑|사진가|인물|girl|boy|woman|women|man|men|baby|child|kid|people|person|portrait|face|model|couple|family/i;

async function search(q) {
  const u = `https://pixabay.com/api/?key=${KEY}&q=${encodeURIComponent(q)}&lang=ko&image_type=photo&orientation=horizontal&min_width=1600&safesearch=true&order=popular&per_page=40`;
  const r = await fetch(u);
  if (r.status === 429) throw new Error('Pixabay 요청 한도 (429)');
  if (!r.ok) throw new Error('Pixabay ' + r.status);
  return (await r.json()).hits || [];
}

// 검색어 낱말이 태그에 들어 있고 사람 태그가 없는 사진만 고른다
function relevant(hit, q) {
  const tags = String(hit.tags || '').replace(/\s/g, '');
  if (PEOPLE.test(String(hit.tags || ''))) return false;
  const toks = q.split(/\s+/).map(t => t.replace(/\s/g, '')).filter(t => t.length >= 2);
  return toks.length > 0 && toks.every(t => tags.includes(t)); // 낱말이 모두 태그에 있어야 한다
}

async function download(hit) {
  const url = hit.fullHDURL || hit.largeImageURL;
  const r = await fetch(url);
  if (!r.ok) throw new Error('사진 내려받기 ' + r.status);
  return Buffer.from(await r.arrayBuffer());
}

async function shoot(browser, site, cat, photo, narrow, design) {
  const w = narrow ? 960 : 1920, h = narrow ? 300 : 240;
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  await p.setContent(buildHtml(site, cat, photo.toString('base64'), narrow, design));
  const png = await p.screenshot({ type: 'png' });
  const webp = await p.evaluate(async b64 => { const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; c.getContext('2d').drawImage(im, 0, 0); return c.toDataURL('image/webp', 0.82).split(',')[1]; }, png.toString('base64'));
  await p.close();
  return Buffer.from(webp, 'base64');
}

const list = JSON.parse(readFileSync(LIST, 'utf8'));
const usedPhotos = new Set(existsSync(USED) ? JSON.parse(readFileSync(USED, 'utf8')) : []);
const usedIds = new Set(list.map(x => x.id));
const siteIds = Object.keys(SITES).filter(id => !SITES[id].draft);
// QUOTA="사이트:장수,..." 로 사이트마다 장수를 따로 정한다 (없으면 COUNT 를 똑같이 나눈다)
const quota = Object.fromEntries((process.env.QUOTA || '').split(',').filter(Boolean).map(x => x.split(':')).map(([k, v]) => [k, Number(v)]));
const perDefault = Math.ceil(COUNT / siteIds.length);
const browser = await chromium.launch();
let made = 0, stop = false;

for (const id of siteIds) {
  const site = SITES[id];
  const per = quota[id] ?? perDefault;
  if (!per) continue;
  const cats = shuffle(Object.keys(site.cats));
  let got = 0, tries = 0;
  while (got < per && tries < cats.length * 5 && !stop) {
    const cat = cats[tries % cats.length];
    const kws = (QMAP[cat] || site.cats[cat].kw).filter(k => !AMBIG.has(k));
    const q = kws[Math.floor(tries / cats.length) % kws.length]; // 같은 카테고리를 다시 만나면 다른 대표 낱말로 찾는다
    tries++;
    try {
      const hits = (await search(q)).filter(h => !usedPhotos.has(h.id) && relevant(h, q));
      await sleep(700);
      if (!hits.length) { console.log('관련 사진 없음', id, cat, q); continue; }
      const hit = pick(hits.slice(0, 8));
      const photo = await download(hit);
      let n = 1, bid; do { bid = `${id[0]}${day}${n++}P`; } while (usedIds.has(bid)); // 끝 P = 무료 사진 (AI 표시 없이 광고 표시만)
      const design = { ...randomDesign(pick(LAYOUTS)), px: '50%' };
      writeFileSync(new URL(`${bid}-w.webp`, OUT), await shoot(browser, site, cat, photo, false, design));
      writeFileSync(new URL(`${bid}-n.webp`, OUT), await shoot(browser, site, cat, photo, true, design));
      usedIds.add(bid); usedPhotos.add(hit.id);
      list.push({ id: bid, site: id, text: copyOf(site, cat, design).title, url: `${site.host}/c/${encodeURIComponent(cat)}`, src: `pixabay:${hit.id}`, q });
      got++; made++;
      console.log('만듦', bid, cat, design.layout, '|', q, '|', String(hit.tags).slice(0, 50));
    } catch (e) { console.log('실패', id, e.message); if (/429|한도/.test(e.message)) stop = true; }
  }
  console.log(id, got + '/' + per);
}
await browser.close();
writeFileSync(LIST, JSON.stringify(list, null, 1) + '\n');
writeFileSync(USED, JSON.stringify([...usedPhotos]) + '\n');
console.log('만든 배너', made);
if (!made) process.exit(1);
