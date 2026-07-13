// feed_token → 완성 .ics 문자열의 5분 인메모리 캐시 (이슈 #11, PLAN §11).
// 목적: 피드 폴링/다수 구독자가 매 요청 Notion을 때리는 걸 흡수해 rate limit(3 req/s) 완화.
// 성공 .ics만 캐시 — 404/502는 호출측에서 저장하지 않는다.
//
// ponytail: 모듈 스코프 Map + Date.now() 직접 사용. 별도 타이머/clock 주입/LRU 없음.
//   - 단일 프로세스 전제(#9 서버리스 불가 확정). 멀티 인스턴스면 인스턴스별 캐시라
//     히트율 저하 + rotate 무효화가 다른 인스턴스에 전파 안 됨 → 그땐 Redis 등으로 승격.
//   - 만료는 lazy(get 시점 delete). setInterval 스윕 없음 — CAP 스윕이 상한을 지킨다.
const cache = new Map<string, { ics: string; expiresAt: number }>()

const TTL_MS = 300_000 // 5분
// ponytail: 무한증가 하드캡. 초과 시 저장 스킵(요청은 정상 처리, 캐시만 포기).
//   구독 캘린더가 1만 개를 넘길 규모면 LRU/eviction 큐로 승격.
const CAP = 10_000

export function getCachedFeed(token: string): string | undefined {
  const entry = cache.get(token)
  if (!entry) return undefined
  if (entry.expiresAt <= Date.now()) {
    cache.delete(token) // lazy 만료
    return undefined
  }
  return entry.ics
}

export function setCachedFeed(token: string, ics: string): void {
  if (cache.size >= CAP) {
    sweepExpired()
    if (cache.size >= CAP) return // 스윕해도 초과 → 저장 스킵
  }
  cache.set(token, { ics, expiresAt: Date.now() + TTL_MS })
}

// rotate(#8)로 폐기된 옛 토큰을 즉시 제거. 자연 만료(≤5분)로 두면 폐기된 URL이
// 최대 5분간 stale .ics를 서빙 → "구독 URL 즉시 무효화" 보장 위반이라 필수.
export function invalidateFeed(token: string): void {
  cache.delete(token)
}

function sweepExpired(): void {
  const now = Date.now()
  for (const [token, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(token)
  }
}
