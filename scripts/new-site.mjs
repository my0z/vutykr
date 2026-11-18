// 새 도메인 사이트 만들기: node scripts/new-site.mjs <영문이름> <도메인> "<사이트 이름>"
// 설정 파일과 등록과 저장소 연결과 도메인 연결을 한 번에 만든 뒤 설정 파일의 문구만 고치면 된다
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const [id, domain, name] = process.argv.slice(2);
if (!/^[a-z]{2,20}$/.test(id || '') || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain || '') || !name) {
  console.log('사용법: node scripts/new-site.mjs <영문소문자이름> <도메인> "<사이트 이름>"');
  process.exit(1);
}
if (existsSync(`sites/${id}.js`)) { console.log('이미 있는 이름입니다'); process.exit(1); }
const ID = id.toUpperCase();

writeFileSync(`sites/${id}.js`, `// ${name} 사이트 설정 — 이 파일 하나만 고치면 이 사이트의 이름과 분야와 검색어와 색상이 바뀝니다
export default {
  id: '${id}',
  domains: ['${domain}', 'www.${domain}'],
  host: 'https://${domain}',
  name: '${name}',
  mark: '✦',
  icon: '🛍',
  logo: '<path d="M6 11h20l-1.6 15.2c-.1.9-.9 1.6-1.8 1.6H9.4c-.9 0-1.7-.7-1.8-1.6z" fill="{c1}"/><path d="M11 14V9.5a5 5 0 0 1 10 0V14" fill="none" stroke="{c2}" stroke-width="2.6" stroke-linecap="round"/>', // 로고 그림 (32칸 SVG 안쪽 내용)
  emptyIcon: '🛍',
  title: '${name} | 인기 랭킹 쇼핑',
  h1: '인기템 랭킹',
  tagline: '인기템',
  desc: '쿠팡 기준 인기템 랭킹을 매일 자동 업데이트합니다',
  intro: '쿠팡 인기템을 분야별로 모아 매일 자동으로 갱신합니다',
  refresh: '여섯 시간마다 자동으로 갱신됩니다.',
  topbar: '🛍 인기템을 매일 자동으로 업데이트해요',
  searchPlaceholder: '찾고 싶은 상품을 검색해보세요',
  heroEmpty: { small: '🛍 ${name}', text: '인기템을 준비하고 있어요' },
  tiles: [
    { cls: 't1', href: '/all', title: '🛍 전체 보기', sub: '인기 상품 모아보기' },
    { cls: 't2', href: '#/talk', title: '💬 수다방', sub: '후기와 꿀팁 구경하기' }
  ],
  theme: {
    color: '#0b5fff',
    light: { bg: '#f4f6fb', card: '#fff', ink: '#14181f', mute: '#6b7686', line: '#e3e8f0', p1: '#0b5fff', p2: '#3d8bff', p3: '#7c3aed', soft: '#eef3ff', shadow: '0 12px 30px -14px rgba(20,40,90,.25)' },
    dark: { bg: '#0c1016', card: '#151b24', ink: '#eef2f8', mute: '#8f9bad', line: '#242d3a', soft: '#1a2433', shadow: '0 12px 30px -14px rgba(0,0,0,.7)' },
    tiles: { t1: { bg: '#fff3c4', ink: '#7a5200', dbg: '#3a2f10', dink: '#ffe08a' }, t2: { bg: '#dff1ff', ink: '#0b4a7a', dbg: '#10283a', dink: '#a9d8ff' } }
  },
  best: [], // 쿠팡 베스트 분류 예: [{ id: 1010, limit: 12, cat: '분야이름' }]
  classify: [], // 상품명 분류 예: ['분야이름', '단어1|단어2']
  block: '성인|아동|키즈|유아',
  reject: [],
  cats: {
    '분야이름': {
      icon: '🛍',
      kw: ['검색어1', '검색어2'],
      intro: '이 분야 인기 상품을 쿠팡 기준으로 모았습니다',
      tips: ['고르는 요령을 여기에 적습니다.', '가격과 후기를 함께 비교하세요.', '재고와 가격은 쿠팡에서 수시로 바뀝니다.', '구매 전 상세 정보를 꼭 확인하세요.']
    }
  },
  seed: [['free', '첫 글', '이곳에서 후기와 꿀팁을 나눠요']],
  faq: [{ q: '가격은 실시간인가요', a: '쿠팡 기준으로 주기적으로 갱신되며 실제 가격은 쿠팡에서 확인하세요.' }]
};
`);

let idx = readFileSync('sites/index.js', 'utf8');
idx = idx.replace(/(import seareal from '\.\/seareal\.js';\n)/, `$1import ${id} from './${id}.js';\n`).replace(/export const SITES = \{ ([^}]*) \};/, `export const SITES = { $1, ${id} };`);
if (!idx.includes(`import ${id} from`)) idx = idx.replace(/(import \w+ from '\.\/\w+\.js';\n)(?!import)/, `$1import ${id} from './${id}.js';\n`);
writeFileSync('sites/index.js', idx);

let w = readFileSync('wrangler.toml', 'utf8');
w = w.replace(/(\n\[assets\])/, `\n# ${name}은 아직 운영 전환 전이라 도메인 연결 없음 (전환할 때 routes에 추가)\n$1`, 1).replace(/\n# 쁘띠.끄 외 두 사이트/, `\n# ${name} 저장소 (id를 비우면 배포할 때 wrangler가 자동으로 만든다)\n[[kv_namespaces]]\nbinding = "DATA_${ID}"\n\n[[d1_databases]]\nbinding = "DB_${ID}"\n\n# 쁘띠.끄 외 두 사이트`);
writeFileSync('wrangler.toml', w);
console.log(`만들었습니다: sites/${id}.js\n다음 순서:\n1. sites/${id}.js의 문구와 분야와 검색어를 고친다\n2. 임시 주소에서 ?site=${id} 로 확인한다\n3. 운영 전환 때 wrangler.toml routes에 ${domain}와 www.${domain}를 추가하고 CRON_SITES에 ${id}를 넣는다`);
