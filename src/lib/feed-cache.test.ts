import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getCachedFeed, invalidateFeed, setCachedFeed } from './feed-cache'

// 모듈 스코프 Map은 테스트 간 상태가 누수되므로 고유 토큰 + fake timer로 격리한다.
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
})
afterEach(() => {
  vi.useRealTimers()
})

describe('feed-cache', () => {
  it('set 직후 get은 hit (동일 ics)', () => {
    setCachedFeed('t-hit', 'ICS-A')
    expect(getCachedFeed('t-hit')).toBe('ICS-A')
  })

  it('저장 안 된 토큰은 miss', () => {
    expect(getCachedFeed('t-never')).toBeUndefined()
  })

  it('TTL(5분) 이내는 hit, 경과 후 miss (lazy 만료)', () => {
    setCachedFeed('t-ttl', 'ICS-B')
    vi.advanceTimersByTime(300_000 - 1)
    expect(getCachedFeed('t-ttl')).toBe('ICS-B')
    vi.advanceTimersByTime(1) // 정확히 만료 경계(expiresAt <= now)
    expect(getCachedFeed('t-ttl')).toBeUndefined()
  })

  it('invalidate 후 get은 miss (#8 rotate 무효화)', () => {
    setCachedFeed('t-inv', 'ICS-C')
    invalidateFeed('t-inv')
    expect(getCachedFeed('t-inv')).toBeUndefined()
  })

  it('CAP 초과 시 신규 저장은 스킵되지만 요청은 정상 (get miss로 처리)', () => {
    // CAP=10_000을 살아있는(미만료) 엔트리로 채우면 스윕이 못 비워 신규 저장 스킵.
    for (let i = 0; i < 10_000; i++) setCachedFeed(`fill-${i}`, `v${i}`)
    setCachedFeed('t-overflow', 'ICS-D')
    expect(getCachedFeed('t-overflow')).toBeUndefined() // 저장 스킵 → miss
    expect(getCachedFeed('fill-0')).toBe('v0') // 기존 엔트리는 온전
  })

  it('CAP 도달 후 만료 엔트리는 스윕으로 회수되어 신규 저장 가능', () => {
    for (let i = 0; i < 10_000; i++) setCachedFeed(`old-${i}`, `v${i}`)
    vi.advanceTimersByTime(300_001) // 채운 엔트리 전부 만료
    setCachedFeed('t-after-sweep', 'ICS-E') // set 시 sweep이 만료분 제거 → 저장 성공
    expect(getCachedFeed('t-after-sweep')).toBe('ICS-E')
  })
})
