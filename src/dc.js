// 사람이 아닌 접속 가려내기: 검색 로봇 이름이 든 브라우저 정보이거나 클라우드 서버 망(데이터센터)에서 온 접속
// 아이폰으로 위장한 링크 검사 로봇이 미국 독일 싱가포르 데이터센터에서 와서 클릭으로 잡히고 쿠팡에는 무효 클릭으로 쌓였다
// iCloud 비공개 릴레이가 쓰는 Cloudflare Akamai Fastly 망은 사람일 수 있어 넣지 않는다
const UA_BOT = /bot|spider|crawl|slurp|preview|facebookexternalhit|curl|python|go-http|monitor|headless|lighthouse/i;
const DC = /amazon|aws|google|microsoft|azure|digitalocean|ovh|hetzner|linode|oracle|alibaba|tencent|huawei cloud|vultr|choopa|contabo|leaseweb|scaleway|m247|datacamp|cdn77|hostinger|ionos|apple inc|zscaler|censys|shodan|palo alto|internet archive|bytedance|naver cloud|kt cloud|nhn cloud|gabia|cafe24|collyer quay|earthlink telecommunications/i;
export const dcNet = req => { const cf = req.cf || {}; return DC.test(String(cf.asOrganization || '')) || !!(cf.botManagement && cf.botManagement.verifiedBot); };
export const isAuto = req => UA_BOT.test(req.headers.get('user-agent') || '') || dcNet(req);
export const noGo = () => new Response('<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>안내</title><p>자동 접속은 쿠팡으로 연결하지 않습니다.</p>', { status: 200, headers: { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
