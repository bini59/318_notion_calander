import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const getCalendarByFeedToken = vi.fn()
const getDecryptedTokenByUserId = vi.fn()
const queryDatabase = vi.fn()

vi.mock('@/lib/calendars', () => ({ getCalendarByFeedToken }))
vi.mock('@/lib/users', () => ({ getDecryptedTokenByUserId }))
vi.mock('@/lib/notion', () => ({ queryDatabase }))
// events.ts / ics.ts는 순수함수 — 실제 로직으로 직렬화 계약을 태운다(모킹 안 함).

let GET: typeof import('./route').GET

beforeAll(async () => {
  ;({ GET } = await import('./route'))
})

beforeEach(() => {
  getCalendarByFeedToken.mockReset()
  getDecryptedTokenByUserId.mockReset()
  queryDatabase.mockReset()
})

const params = (token: string) => ({ params: Promise.resolve({ token }) })
const calendar = { userId: 'u1', databaseId: 'db1', mapping: { title: 'Name', start: 'When' } }
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
  })
})
