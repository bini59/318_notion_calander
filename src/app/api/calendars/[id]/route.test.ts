import { NextRequest } from 'next/server'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const readSession = vi.fn()
const getDecryptedTokenByUserId = vi.fn()
const deleteCalendar = vi.fn()
const renameCalendar = vi.fn()

vi.mock('@/lib/session', () => ({ readSession }))
vi.mock('@/lib/users', () => ({ getDecryptedTokenByUserId }))
vi.mock('@/lib/calendars', () => ({ deleteCalendar, renameCalendar }))

let DELETE: typeof import('./route').DELETE
let PATCH: typeof import('./route').PATCH

beforeAll(async () => {
  ;({ DELETE, PATCH } = await import('./route'))
})

beforeEach(() => {
  readSession.mockReset()
  getDecryptedTokenByUserId.mockReset()
  deleteCalendar.mockReset()
  renameCalendar.mockReset()
})

const req = () => new NextRequest('http://localhost:3000/api/calendars/cal-1', { method: 'DELETE' })
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const patchReq = (body: unknown) =>
  new NextRequest('http://localhost:3000/api/calendars/cal-1', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })

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

describe('PATCH /api/calendars/[id] (rename #18)', () => {
  it('returns 401 when there is no session', async () => {
    readSession.mockReturnValue(null)
    const res = await PATCH(patchReq({ name: 'x' }), params('cal-1'))
    expect(res.status).toBe(401)
    expect(renameCalendar).not.toHaveBeenCalled()
  })

  it('returns 400 for a missing/blank name', async () => {
    readSession.mockReturnValue('user-1')
    const res = await PATCH(patchReq({ name: '   ' }), params('cal-1'))
    expect(res.status).toBe(400)
    expect(renameCalendar).not.toHaveBeenCalled()
  })

  it('returns 404 when not owned by the session user (IDOR → no existence leak)', async () => {
    readSession.mockReturnValue('user-1')
    renameCalendar.mockReturnValue(undefined)
    const res = await PATCH(patchReq({ name: 'hijack' }), params('cal-1'))
    expect(res.status).toBe(404)
    expect(renameCalendar).toHaveBeenCalledWith('cal-1', 'user-1', 'hijack')
  })

  it('returns 200 with the saved name for the owner', async () => {
    readSession.mockReturnValue('user-1')
    renameCalendar.mockReturnValue({ name: '회의' })
    const res = await PATCH(patchReq({ name: ' 회의 ' }), params('cal-1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ name: '회의' })
    expect(renameCalendar).toHaveBeenCalledWith('cal-1', 'user-1', '회의')
  })
})
