import { NextRequest } from 'next/server'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const readSession = vi.fn()
const getDecryptedTokenByUserId = vi.fn()
const hasDateProperty = vi.fn()
const createCalendar = vi.fn()

vi.mock('@/lib/session', () => ({ readSession }))
vi.mock('@/lib/users', () => ({ getDecryptedTokenByUserId }))
vi.mock('@/lib/notion', () => ({ hasDateProperty }))
vi.mock('@/lib/calendars', () => ({ createCalendar }))

let POST: typeof import('./route').POST

beforeAll(async () => {
  ;({ POST } = await import('./route'))
})

beforeEach(() => {
  readSession.mockReset()
  getDecryptedTokenByUserId.mockReset()
  hasDateProperty.mockReset()
  createCalendar.mockReset()
})

function req(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/calendars', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/calendars', () => {
  it('returns 401 when there is no session', async () => {
    readSession.mockReturnValue(null)
    const res = await POST(req({ databaseId: 'db1' }))
    expect(res.status).toBe(401)
    expect(createCalendar).not.toHaveBeenCalled()
  })

  it('returns 400 for a body missing databaseId', async () => {
    readSession.mockReturnValue('user-1')
    const res = await POST(req({ nope: true }))
    expect(res.status).toBe(400)
    expect(createCalendar).not.toHaveBeenCalled()
  })

  it('returns 400 when the DB has no date property (PLAN §5 guard)', async () => {
    readSession.mockReturnValue('user-1')
    getDecryptedTokenByUserId.mockReturnValue('tok')
    hasDateProperty.mockResolvedValue(false)
    const res = await POST(req({ databaseId: 'db1' }))
    expect(res.status).toBe(400)
    expect(createCalendar).not.toHaveBeenCalled()
  })

  it('creates a calendar and returns the feed URL', async () => {
    readSession.mockReturnValue('user-1')
    getDecryptedTokenByUserId.mockReturnValue('tok')
    hasDateProperty.mockResolvedValue(true)
    createCalendar.mockReturnValue({ feedToken: 'tok123', feedUrl: 'https://x/feed/tok123.ics' })
    const res = await POST(req({ databaseId: 'db1' }))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ feedUrl: 'https://x/feed/tok123.ics' })
    expect(createCalendar).toHaveBeenCalledWith({ userId: 'user-1', databaseId: 'db1' })
  })
})
