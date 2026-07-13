import { NextRequest } from 'next/server'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const readSession = vi.fn()
const getDecryptedTokenByUserId = vi.fn()
const getDatabaseProperties = vi.fn()
const createCalendar = vi.fn()

vi.mock('@/lib/session', () => ({ readSession }))
vi.mock('@/lib/users', () => ({ getDecryptedTokenByUserId }))
vi.mock('@/lib/notion', () => ({ getDatabaseProperties }))
vi.mock('@/lib/calendars', () => ({ createCalendar }))
// mapping.ts는 순수함수 — 실제 검증 로직으로 신뢰경계를 테스트한다(모킹 안 함).

let POST: typeof import('./route').POST

beforeAll(async () => {
  ;({ POST } = await import('./route'))
})

beforeEach(() => {
  readSession.mockReset()
  getDecryptedTokenByUserId.mockReset()
  getDatabaseProperties.mockReset()
  createCalendar.mockReset()
})

function req(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/calendars', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validMapping = { title: 'Name', start: 'When' }
const dbProps = [
  { name: 'Name', type: 'title' },
  { name: 'When', type: 'date' },
  { name: 'Notes', type: 'rich_text' },
]

describe('POST /api/calendars', () => {
  it('returns 401 when there is no session', async () => {
    readSession.mockReturnValue(null)
    const res = await POST(req({ databaseId: 'db1', mapping: validMapping }))
    expect(res.status).toBe(401)
    expect(createCalendar).not.toHaveBeenCalled()
  })

  it('returns 400 for a body missing the mapping', async () => {
    readSession.mockReturnValue('user-1')
    const res = await POST(req({ databaseId: 'db1' }))
    expect(res.status).toBe(400)
    expect(createCalendar).not.toHaveBeenCalled()
  })

  it('returns 400 for a mapping missing the required start field', async () => {
    readSession.mockReturnValue('user-1')
    const res = await POST(req({ databaseId: 'db1', mapping: { title: 'Name' } }))
    expect(res.status).toBe(400)
    expect(createCalendar).not.toHaveBeenCalled()
  })

  it('returns 400 when the DB has no date property (PLAN §5 guard)', async () => {
    readSession.mockReturnValue('user-1')
    getDecryptedTokenByUserId.mockReturnValue('tok')
    getDatabaseProperties.mockResolvedValue([{ name: 'Name', type: 'title' }])
    const res = await POST(req({ databaseId: 'db1', mapping: validMapping }))
    expect(res.status).toBe(400)
    expect(createCalendar).not.toHaveBeenCalled()
  })

  it('rejects a forged mapping whose start is not a date property (trust boundary)', async () => {
    readSession.mockReturnValue('user-1')
    getDecryptedTokenByUserId.mockReturnValue('tok')
    getDatabaseProperties.mockResolvedValue(dbProps)
    // 클라가 start를 rich_text 속성으로 위조 → 서버 재검증에서 거부.
    const res = await POST(req({ databaseId: 'db1', mapping: { title: 'Name', start: 'Notes' } }))
    expect(res.status).toBe(400)
    expect(createCalendar).not.toHaveBeenCalled()
  })

  it('rejects a mapping referencing a property that does not exist', async () => {
    readSession.mockReturnValue('user-1')
    getDecryptedTokenByUserId.mockReturnValue('tok')
    getDatabaseProperties.mockResolvedValue(dbProps)
    const res = await POST(req({ databaseId: 'db1', mapping: { title: 'Name', start: 'Ghost' } }))
    expect(res.status).toBe(400)
    expect(createCalendar).not.toHaveBeenCalled()
  })

  it('creates a calendar and returns the feed URL for a valid mapping', async () => {
    readSession.mockReturnValue('user-1')
    getDecryptedTokenByUserId.mockReturnValue('tok')
    getDatabaseProperties.mockResolvedValue(dbProps)
    createCalendar.mockReturnValue({
      id: 'cal-1',
      feedToken: 'tok123',
      feedUrl: 'https://x/feed/tok123.ics',
    })
    const res = await POST(req({ databaseId: 'db1', mapping: validMapping }))
    expect(res.status).toBe(201)
    // id는 setup이 재발급에 쓴다 (#8) — 응답 shape에 포함되어야 한다.
    expect(await res.json()).toEqual({ id: 'cal-1', feedUrl: 'https://x/feed/tok123.ics' })
    expect(createCalendar).toHaveBeenCalledWith({
      userId: 'user-1',
      databaseId: 'db1',
      mapping: validMapping,
    })
  })

  it('returns 502 when Notion property retrieval fails', async () => {
    readSession.mockReturnValue('user-1')
    getDecryptedTokenByUserId.mockReturnValue('tok')
    getDatabaseProperties.mockRejectedValue(new Error('boom'))
    const res = await POST(req({ databaseId: 'db1', mapping: validMapping }))
    expect(res.status).toBe(502)
    expect(createCalendar).not.toHaveBeenCalled()
  })
})
