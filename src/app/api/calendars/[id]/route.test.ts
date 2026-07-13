import { NextRequest } from 'next/server'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const readSession = vi.fn()
const getDecryptedTokenByUserId = vi.fn()
const deleteCalendar = vi.fn()

vi.mock('@/lib/session', () => ({ readSession }))
vi.mock('@/lib/users', () => ({ getDecryptedTokenByUserId }))
vi.mock('@/lib/calendars', () => ({ deleteCalendar }))

let DELETE: typeof import('./route').DELETE

beforeAll(async () => {
  ;({ DELETE } = await import('./route'))
})

beforeEach(() => {
  readSession.mockReset()
  getDecryptedTokenByUserId.mockReset()
  deleteCalendar.mockReset()
})

const req = () => new NextRequest('http://localhost:3000/api/calendars/cal-1', { method: 'DELETE' })
const params = (id: string) => ({ params: Promise.resolve({ id }) })

describe('DELETE /api/calendars/[id]', () => {
  it('returns 401 when there is no session', async () => {
    readSession.mockReturnValue(null)
    const res = await DELETE(req(), params('cal-1'))
    expect(res.status).toBe(401)
    expect(deleteCalendar).not.toHaveBeenCalled()
  })

  it('returns 404 when the calendar is not owned by the session user (IDOR → no existence leak)', async () => {
    readSession.mockReturnValue('user-1')
    getDecryptedTokenByUserId.mockReturnValue('tok')
    deleteCalendar.mockReturnValue(false)
    const res = await DELETE(req(), params('cal-1'))
    expect(res.status).toBe(404)
    expect(deleteCalendar).toHaveBeenCalledWith('cal-1', 'user-1')
  })

  it('returns 204 with no body for the owner', async () => {
    readSession.mockReturnValue('user-1')
    getDecryptedTokenByUserId.mockReturnValue('tok')
    deleteCalendar.mockReturnValue(true)
    const res = await DELETE(req(), params('cal-1'))
    expect(res.status).toBe(204)
    expect(deleteCalendar).toHaveBeenCalledWith('cal-1', 'user-1')
  })
})
