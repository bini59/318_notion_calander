import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { invalidateFeed } from '@/lib/feed-cache'

const getCalendarByFeedToken = vi.fn()
const getDecryptedTokenByUserId = vi.fn()
const queryDatabase = vi.fn()
const fetchPageBodyText = vi.fn()

vi.mock('@/lib/calendars', () => ({ getCalendarByFeedToken }))
vi.mock('@/lib/users', () => ({ getDecryptedTokenByUserId }))
// buildNotionFilter는 실제 구현 유지(라우트가 mapping.filters를 넘긴다) — queryDatabase/fetchPageBodyText만 모킹.
vi.mock('@/lib/notion', async () => ({
  ...(await vi.importActual<typeof import('@/lib/notion')>('@/lib/notion')),
  queryDatabase,
  fetchPageBodyText,
}))
// feed-cache는 실제 모듈 — 캐시 hit/miss가 queryDatabase 호출횟수로 관측되게 태운다(#11).
// events.ts / ics.ts는 순수함수 — 실제 로직으로 직렬화 계약을 태운다(모킹 안 함).

let GET: typeof import('./route').GET

beforeAll(async () => {
  ;({ GET } = await import('./route'))
})

beforeEach(() => {
  getCalendarByFeedToken.mockReset()
  getDecryptedTokenByUserId.mockReset()
  queryDatabase.mockReset()
  fetchPageBodyText.mockReset()
})

const params = (token: string) => ({ params: Promise.resolve({ token }) })
const calendar = { userId: 'u1', name: '내 일정', databaseId: 'db1', mapping: { title: 'Name', start: 'When' } }
const page = {
  id: 'pg1',
  url: 'https://notion.so/pg1',
  properties: {
    Name: { title: [{ plain_text: 'Event' }] },
    When: { date: { start: '2026-07-13' } },
  },
}

describe('GET /feed/[token].ics', () => {
  it('returns 404 for an invalid/unknown token (no existence leak)', async () => {
    getCalendarByFeedToken.mockReturnValue(undefined)
    const res = await GET(new Request('http://x/feed/bad.ics'), params('bad.ics'))
    expect(res.status).toBe(404)
    expect(getDecryptedTokenByUserId).not.toHaveBeenCalled()
  })

  it('returns 502 when Notion fails (status-only, no detail in body)', async () => {
    getCalendarByFeedToken.mockReturnValue(calendar)
    getDecryptedTokenByUserId.mockReturnValue('tok')
    queryDatabase.mockRejectedValue(new Error('Notion query failed: 429'))
    const res = await GET(new Request('http://x/feed/t.ics'), params('t.ics'))
    expect(res.status).toBe(502)
    expect(await res.text()).not.toContain('429')
  })

  it('strips .ics and serves text/calendar for a valid token', async () => {
    getCalendarByFeedToken.mockReturnValue(calendar)
    getDecryptedTokenByUserId.mockReturnValue('tok')
    queryDatabase.mockResolvedValue([page])
    const res = await GET(new Request('http://x/feed/abc123.ics'), params('abc123.ics'))

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/calendar')
    // .ics는 조회 전에 벗겨져야 한다 — 토큰 자체는 확장자 없는 값.
    expect(getCalendarByFeedToken).toHaveBeenCalledWith('abc123')
    const body = await res.text()
    expect(body).toContain('BEGIN:VCALENDAR')
    expect(body).toContain('UID:pg1')
    // 캘린더 이름이 X-WR-CALNAME으로 흘러야 한다 (#18).
    expect(body).toContain('X-WR-CALNAME:내 일정')
  })
})

describe('GET /feed/[token].ics — 5분 캐시 (#11)', () => {
  // 모듈 스코프 캐시 + Date.now() 기반 TTL → fake timer + 테스트별 고유 토큰으로 격리.
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    getCalendarByFeedToken.mockReturnValue(calendar)
    getDecryptedTokenByUserId.mockReturnValue('tok')
    queryDatabase.mockResolvedValue([page])
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('첫 요청 miss → Notion 조회, 5분 내 재요청 hit → 재조회 안 함', async () => {
    invalidateFeed('cache1')
    await GET(new Request('http://x/feed/cache1.ics'), params('cache1.ics'))
    expect(queryDatabase).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(299_000) // 5분 이내
    const hit = await GET(new Request('http://x/feed/cache1.ics'), params('cache1.ics'))
    expect(queryDatabase).toHaveBeenCalledTimes(1) // 캐시 hit — Notion 미조회
    expect(await hit.text()).toContain('UID:pg1')
  })

  it('TTL(5분) 경과 후 재요청은 다시 Notion 조회', async () => {
    invalidateFeed('cache2')
    await GET(new Request('http://x/feed/cache2.ics'), params('cache2.ics'))
    vi.advanceTimersByTime(300_001) // 만료
    await GET(new Request('http://x/feed/cache2.ics'), params('cache2.ics'))
    expect(queryDatabase).toHaveBeenCalledTimes(2)
  })

  it('502(Notion 실패)는 캐시하지 않음 — 다음 요청도 재조회', async () => {
    invalidateFeed('cache3')
    queryDatabase.mockRejectedValueOnce(new Error('Notion query failed: 429'))
    const fail = await GET(new Request('http://x/feed/cache3.ics'), params('cache3.ics'))
    expect(fail.status).toBe(502)

    queryDatabase.mockResolvedValue([page])
    const ok = await GET(new Request('http://x/feed/cache3.ics'), params('cache3.ics'))
    expect(ok.status).toBe(200)
    expect(queryDatabase).toHaveBeenCalledTimes(2) // 502가 캐시됐다면 2회가 아니었을 것
  })
})

describe("GET /feed/[token].ics — descriptionSource 'body' (#17)", () => {
  const twoPages = [
    { id: 'pg1', url: 'https://notion.so/pg1', properties: { Name: { title: [{ plain_text: 'A' }] }, When: { date: { start: '2026-07-13' } } } },
    { id: 'pg2', url: 'https://notion.so/pg2', properties: { Name: { title: [{ plain_text: 'B' }] }, When: { date: { start: '2026-07-14' } } } },
  ]

  beforeEach(() => {
    getDecryptedTokenByUserId.mockReturnValue('tok')
    queryDatabase.mockResolvedValue(twoPages)
  })

  it('fetches page body once per page and injects it into DESCRIPTION', async () => {
    invalidateFeed('body1')
    getCalendarByFeedToken.mockReturnValue({
      userId: 'u1',
      databaseId: 'db1',
      mapping: { title: 'Name', start: 'When', descriptionSource: 'body' },
    })
    fetchPageBodyText.mockImplementation(async (_tok: string, id: string) => `body of ${id}`)

    const res = await GET(new Request('http://x/feed/body1.ics'), params('body1.ics'))
    expect(res.status).toBe(200)
    // 페이지당 정확히 1회 (N+1 순차 루프).
    expect(fetchPageBodyText).toHaveBeenCalledTimes(2)
    const body = await res.text()
    expect(body).toContain('body of pg1')
    expect(body).toContain('body of pg2')
  })

  it('degrades per-page: one body fetch failing still emits every event, only that page loses description', async () => {
    invalidateFeed('bodyfail1')
    getCalendarByFeedToken.mockReturnValue({
      userId: 'u1',
      databaseId: 'db1',
      mapping: { title: 'Name', start: 'When', descriptionSource: 'body' },
    })
    fetchPageBodyText.mockImplementation(async (_tok: string, id: string) => {
      if (id === 'pg1') throw new Error('Notion block children failed: 500')
      return `body of ${id}`
    })

    const res = await GET(new Request('http://x/feed/bodyfail1.ics'), params('bodyfail1.ics'))
    expect(res.status).toBe(200) // 한 페이지 실패로 피드 전체가 죽지 않는다
    const body = await res.text()
    expect(body).toContain('UID:pg1') // 이벤트 자체는 나옴
    expect(body).toContain('UID:pg2')
    expect(body).toContain('body of pg2') // 성공한 페이지는 description 있음
    expect(body).not.toContain('body of pg1') // 실패한 페이지만 description 없음
  })

  it("does not fetch page bodies for the default 'property' source (추가 호출 0)", async () => {
    invalidateFeed('prop1')
    getCalendarByFeedToken.mockReturnValue({
      userId: 'u1',
      databaseId: 'db1',
      mapping: { title: 'Name', start: 'When' }, // descriptionSource 부재 = property
    })

    const res = await GET(new Request('http://x/feed/prop1.ics'), params('prop1.ics'))
    expect(res.status).toBe(200)
    expect(fetchPageBodyText).not.toHaveBeenCalled()
  })
})
