import { NextRequest } from 'next/server'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const readSession = vi.fn()
const getUserByAuthId = vi.fn()
const rotateFeedToken = vi.fn()

vi.mock('@/lib/session', () => ({ readSession }))
vi.mock('@/lib/users', () => ({ getUserByAuthId }))
vi.mock('@/lib/calendars', () => ({ rotateFeedToken }))

let POST: typeof import('./route').POST

beforeAll(async () => {
  ;({ POST } = await import('./route'))
})

beforeEach(() => {
  readSession.mockReset()
  getUserByAuthId.mockReset()
  getUserByAuthId.mockReturnValue({ id: 'user-1', accessToken: 'tok' })
  rotateFeedToken.mockReset()
})

const req = () => new NextRequest('http://localhost:3000/api/calendars/cal-1/rotate', { method: 'POST' })
const params = (id: string) => ({ params: Promise.resolve({ id }) })

describe('POST /api/calendars/[id]/rotate', () => {
  it('returns 401 when there is no session', async () => {
    readSession.mockReturnValue(null)
    const res = await POST(req(), params('cal-1'))
    expect(res.status).toBe(401)
    expect(rotateFeedToken).not.toHaveBeenCalled()
  })

  it('returns 404 when the calendar is not owned by the session user (IDOR → no existence leak)', async () => {
    readSession.mockReturnValue('user-1')
    getUserByAuthId.mockReturnValue({ id: 'user-1', accessToken: 'tok' })
    rotateFeedToken.mockReturnValue(undefined)
    const res = await POST(req(), params('cal-1'))
    expect(res.status).toBe(404)
    expect(rotateFeedToken).toHaveBeenCalledWith('cal-1', 'user-1')
  })

  it('returns 200 with the new feed URL for the owner', async () => {
    readSession.mockReturnValue('user-1')
    getUserByAuthId.mockReturnValue({ id: 'user-1', accessToken: 'tok' })
    rotateFeedToken.mockReturnValue({ feedUrl: 'https://x/feed/new.ics' })
    const res = await POST(req(), params('cal-1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ feedUrl: 'https://x/feed/new.ics' })
  })
})
