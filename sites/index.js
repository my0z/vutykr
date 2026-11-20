// 사이트 목록과 사이트가 함께 쓰는 값 — 새 사이트를 만들려면 sites/ 폴더에 설정 파일을 하나 더 만들고 여기에 한 줄을 더하면 된다
import vuty from './vuty.js';
import bodcar from './bodcar.js';
import seareal from './seareal.js';
import bebepong from './bebepong.js';
import pemily from './pemily.js';
import bright from './bright.js';
import guideVuty from './guides/vuty.js';
import guideBodcar from './guides/bodcar.js';
import guideSeareal from './guides/seareal.js';
import guideZakgong from './guides/zakgong.js';
import guidePemily from './guides/pemily.js';
import guideBebepong from './guides/bebepong.js';
import moreVuty from './guides/vuty-more.js';
import moreBodcar from './guides/bodcar-more.js';
import moreSeareal from './guides/seareal-more.js';
import moreZakgong from './guides/zakgong-more.js';
import zakgong from './zakgong.js';

// 분야별 구매 가이드 글을 각 사이트 설정에 붙인다 (새 사이트는 sites/guides/<이름>.js 를 만들고 여기에 한 줄을 더한다)
const withMore = (g, more) => { for (const [c, v] of Object.entries(g)) v.sections = [...v.sections, ...(more[c] || [])]; return g; };
vuty.guides = withMore(guideVuty, moreVuty); bodcar.guides = withMore(guideBodcar, moreBodcar); seareal.guides = withMore(guideSeareal, moreSeareal); zakgong.guides = withMore(guideZakgong, moreZakgong); pemily.guides = guidePemily; bebepong.guides = guideBebepong;

// 사이트마다 화사한 꾸밈 (쁘띠.끄는 자기 설정 파일에 있다)
bodcar.theme.extra = bright({ a: '#cfe3ff', b: '#d0f1ff', c: '#e1dcff', base: '#f3f8ff', line: '#d3e3ff', soft: '#e8f1ff', g1: '#0b5fff', g2: '#2f9bff', g3: '#7c5cff', glow: '11,95,255' });
seareal.theme.extra = bright({ a: '#c9edff', b: '#d2f7ec', c: '#dcebff', base: '#f1faff', line: '#cde8f5', soft: '#e3f6fd', g1: '#0284c7', g2: '#06b6d4', g3: '#14b8a6', glow: '2,132,199' });
zakgong.theme.extra = bright({ a: '#ffe0bf', b: '#fff0c2', c: '#ffe0d6', base: '#fff8f0', line: '#ffe0c4', soft: '#fff1e0', g1: '#ea580c', g2: '#f59e0b', g3: '#f97316', glow: '234,88,12' });
pemily.theme.extra = bright({ a: '#d4f5d9', b: '#fff3c2', c: '#d6efff', base: '#f4fbf4', line: '#d5ecd8', soft: '#e9f8ec', g1: '#16a34a', g2: '#65c466', g3: '#0ea5e9', glow: '22,163,74' });

bebepong.theme.extra = bright({ a: '#e4dcff', b: '#fff0c2', c: '#d9f3ec', base: '#f8f5ff', line: '#e3dcff', soft: '#efeaff', g1: '#7c5cff', g2: '#b19cff', g3: '#ffb703', glow: '124,92,255' });

export const SITES = { vuty, bodcar, seareal, zakgong, pemily, bebepong };
export const DEFAULT_SITE = 'vuty'; // 등록되지 않은 주소(workers.dev 등)로 들어오면 보여 줄 사이트

// 쿠팡 파트너스 경제적 이해관계 표시 문구 (공식 예시 문장과 같은 뜻으로 쉼표만 뺐다)
export const DISC = '이 포스팅은 쿠팡 파트너스 활동의 일환으로 이에 따른 일정액의 수수료를 제공받습니다.';

// 사이트 위에 무작위로 보여 주는 자매 사이트 배너 (내 사이트 배너는 빼고 보여 준다). 이미지는 public/promo/ 폴더에 있다
export const PROMOS = [
  { id: 'b1', site: 'bodcar', text: '자동차용품 인기 랭킹 한눈에', url: 'https://bodcar.com/' },
  { id: 'b2', site: 'bodcar', text: '차박 준비물 베스트 모아보기', url: 'https://bodcar.com/c/%EC%B0%A8%EB%B0%95%EC%BA%A0%ED%95%91' },
  { id: 'b3', site: 'bodcar', text: '블랙박스와 엔진오일 인기템', url: 'https://bodcar.com/c/%EB%B8%94%EB%9E%99%EB%B0%95%EC%8A%A4' },
  { id: 'b4', site: 'bodcar', text: '캠핑 SUV 필수 용품 인기템', url: 'https://bodcar.com/c/%EC%B0%A8%EB%B0%95%EC%BA%A0%ED%95%91' },
  { id: 'v1', site: 'vuty', text: '쁘띠.끄 뷰티 인기템 랭킹', url: 'https://vuty.kr/' },
  { id: 'v2', site: 'vuty', text: '선케어 모아보기', url: 'https://vuty.kr/c/%EC%84%A0%EC%BC%80%EC%96%B4' },
  { id: 'v3', site: 'vuty', text: '스킨케어 베스트 랭킹', url: 'https://vuty.kr/c/%EC%8A%A4%ED%82%A8%EC%BC%80%EC%96%B4' },
  { id: 'v4', site: 'vuty', text: '여성 뷰티와 패션 인기템', url: 'https://vuty.kr/' },
  { id: 'v5', site: 'vuty', text: '여성 의류 인기 랭킹', url: 'https://vuty.kr/c/%EC%9D%98%EB%A5%98' },
  { id: 's1', site: 'seareal', text: '바다의 모든 것 인기 랭킹', url: 'https://seareal.kr/' },
  { id: 's2', site: 'seareal', text: '바다낚시 용품 모아보기', url: 'https://seareal.kr/c/%EB%82%9A%EC%8B%9C%EB%8C%80%EB%A6%B4' },
  { id: 's3', site: 'seareal', text: '신선 수산물 인기템 모아보기', url: 'https://seareal.kr/c/%ED%8C%A8%EB%A5%98' },
  { id: 's4', site: 'seareal', text: '낚시 필수템 인기 랭킹', url: 'https://seareal.kr/c/%EB%82%9A%EC%8B%9C%EB%8C%80%EB%A6%B4' },
  { id: 'z1', site: 'zakgong', text: '작업 공구 인기 랭킹 한눈에', url: 'https://zakgong.com/' },
  { id: 'z2', site: 'zakgong', text: '전동 드릴과 임팩트 드라이버 인기템', url: 'https://zakgong.com/c/%EC%A0%84%EB%8F%99%EA%B3%B5%EA%B5%AC' },
  { id: 'z3', site: 'zakgong', text: '공구함과 수납용품 모아보기', url: 'https://zakgong.com/c/%EA%B3%B5%EA%B5%AC%ED%95%A8%EC%88%98%EB%82%A9' },
  { id: 'z4', site: 'zakgong', text: '작업 안전용품 필수템', url: 'https://zakgong.com/c/%EC%95%88%EC%A0%84%EC%9A%A9%ED%92%88' },
  { id: 'p1', site: 'pemily', text: '강아지 사료와 간식 인기 랭킹', url: 'https://pemily.kr/c/%EC%82%AC%EB%A3%8C' },
  { id: 'p2', site: 'pemily', text: '고양이 스크래처와 캣타워 인기템', url: 'https://pemily.kr/c/%EC%8A%A4%ED%81%AC%EB%9E%98%EC%B2%98%EC%BA%A3%ED%83%80%EC%9B%8C' },
  { id: 'p3', site: 'pemily', text: '햄스터와 소동물 용품 모아보기', url: 'https://pemily.kr/c/%EC%86%8C%EB%8F%99%EB%AC%BC%EC%A1%B0%EB%A5%98' },
  { id: 'p4', site: 'pemily', text: '앵무새 사료와 새장 인기 랭킹', url: 'https://pemily.kr/c/%EC%86%8C%EB%8F%99%EB%AC%BC%EC%A1%B0%EB%A5%98' },
  { id: 'p5', site: 'pemily', text: '관상어 어항과 여과기 인기템', url: 'https://pemily.kr/c/%EA%B4%80%EC%83%81%EC%96%B4' },
  { id: 'p6', site: 'pemily', text: '하네스와 리드줄 산책용품 인기템', url: 'https://pemily.kr/c/%EC%82%B0%EC%B1%85%EC%99%B8%EC%B6%9C' },
  { id: 'g1', site: 'bebepong', text: '아기 장난감과 놀이매트 인기 랭킹', url: 'https://bebepong.com/c/%EC%9E%A5%EB%82%9C%EA%B0%90%EC%99%84%EA%B5%AC' },
  { id: 'g2', site: 'bebepong', text: '이유식 식기와 하이체어 인기템', url: 'https://bebepong.com/c/%EC%9D%B4%EC%9C%A0%EC%8B%9D%EC%9A%A9%ED%92%88' },
  { id: 'g3', site: 'bebepong', text: '유모차와 카시트 인기 랭킹', url: 'https://bebepong.com/c/%EC%9C%A0%EB%AA%A8%EC%B0%A8%EC%B9%B4%EC%8B%9C%ED%8A%B8' },
  { id: 'u1', site: 'usb', text: 'USB.KR 전자기기 가격 비교', url: 'https://usb.kr/' },
  { id: 'u2', site: 'usb', text: '차량용 전자기기 모아보기', url: 'https://usb.kr/category/car' },
  { id: 'u3', site: 'usb', text: '쿠팡 골드박스 전자기기 핫딜', url: 'https://usb.kr/deals' }
];

// 방문한 주소로 어느 사이트인지 찾는다
const BY_HOST = new Map(Object.values(SITES).flatMap(s => s.domains.map(d => [d, s])));
// 대표 주소로 옮겨 줄 다른 주소들 (사이트 설정의 redirects)
const REDIRECTS = new Map(Object.values(SITES).flatMap(s => (s.redirects || []).map(d => [d, s.host])));
export const redirectForHost = host => REDIRECTS.get(String(host || '').toLowerCase()) || null;
export const siteForHost = host => BY_HOST.get(String(host || '').toLowerCase()) || null;
