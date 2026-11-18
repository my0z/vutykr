// 사이트 목록과 사이트가 함께 쓰는 값 — 새 사이트를 만들려면 sites/ 폴더에 설정 파일을 하나 더 만들고 여기에 한 줄을 더하면 된다
import vuty from './vuty.js';
import bodcar from './bodcar.js';
import seareal from './seareal.js';

export const SITES = { vuty, bodcar, seareal };
export const DEFAULT_SITE = 'vuty'; // 등록되지 않은 주소(workers.dev 등)로 들어오면 보여 줄 사이트

// 쿠팡 파트너스 경제적 이해관계 표시 문구 (공식 예시 문장과 같은 뜻으로 쉼표만 뺐다)
export const DISC = '이 포스팅은 쿠팡 파트너스 활동의 일환으로 이에 따른 일정액의 수수료를 제공받습니다.';

// 사이트 위에 무작위로 보여 주는 자매 사이트 배너 (내 사이트 배너는 빼고 보여 준다). 이미지는 public/promo/ 폴더에 있다
export const PROMOS = [
  { id: 'b1', site: 'bodcar', text: '자동차용품 인기 랭킹 한눈에', url: 'https://bodcar.com/' },
  { id: 'b2', site: 'bodcar', text: '차박 준비물 베스트 모아보기', url: 'https://bodcar.com/c/%EC%B0%A8%EB%B0%95%EC%BA%A0%ED%95%91' },
  { id: 'b3', site: 'bodcar', text: '블랙박스와 엔진오일 인기템', url: 'https://bodcar.com/c/%EB%B8%94%EB%9E%99%EB%B0%95%EC%8A%A4' },
  { id: 'v1', site: 'vuty', text: '쁘띠.끄 뷰티 인기템 랭킹', url: 'https://vuty.kr/' },
  { id: 'v2', site: 'vuty', text: '선케어 모아보기', url: 'https://vuty.kr/c/%EC%84%A0%EC%BC%80%EC%96%B4' },
  { id: 'v3', site: 'vuty', text: '스킨케어 베스트 랭킹', url: 'https://vuty.kr/c/%EC%8A%A4%ED%82%A8%EC%BC%80%EC%96%B4' },
  { id: 's1', site: 'seareal', text: '바다의 모든 것 인기 랭킹', url: 'https://seareal.kr/' },
  { id: 's2', site: 'seareal', text: '바다낚시 용품 모아보기', url: 'https://seareal.kr/c/%EB%82%9A%EC%8B%9C%EB%8C%80%EB%A6%B4' },
  { id: 's3', site: 'seareal', text: '신선 수산물 인기템 모아보기', url: 'https://seareal.kr/c/%ED%8C%A8%EB%A5%98' },
  { id: 'u1', site: 'usb', text: 'USB.KR 전자기기 가격 비교', url: 'https://usb.kr/' },
  { id: 'u2', site: 'usb', text: '차량용 전자기기 모아보기', url: 'https://usb.kr/category/car' },
  { id: 'u3', site: 'usb', text: '쿠팡 골드박스 전자기기 핫딜', url: 'https://usb.kr/deals' }
];

// 방문한 주소로 어느 사이트인지 찾는다
const BY_HOST = new Map(Object.values(SITES).flatMap(s => s.domains.map(d => [d, s])));
export const siteForHost = host => BY_HOST.get(String(host || '').toLowerCase()) || null;
