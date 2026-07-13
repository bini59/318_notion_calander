import { NextRequest } from 'next/server'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const readSession = vi.fn()
const getDecryptedTokenByUserId = vi.fn()
const getDatabaseProperties = vi.fn()

vi.mock('@/lib/session', () => ({ readSession }))
vi.mock('@/lib/users', () => ({ getDecryptedTokenByUserId }))
vi.mock('@/lib/notion', () => ({ getDatabaseProperties }))

let GET: typeof import('./route').GET

beforeAll(async () => {
  ;({ GET } = await import('./route'))
})

beforeEach(() => {
  readSession.mockReset()
  getDecryptedTokenByUserId.mockReset()
  getDatabaseProperties.mockReset()
})

const req = () => new NextRequest('http://localhost:3000/api/databases/db1')
const ctx = { params: Promise.resolve({ id: 'db1' }) }

describe('GET /api/databases/[id]', () => {
  it('returns 401 when there is no session', async () => {
    readSession.mockReturnValue(null)
    const res = await GET(req(), ctx)
    expect(res.status).toBe(401)
    expect(getDatabaseProperties).not.toHaveBeenCalled()
  })

  it('returns 401 when the session user no longer exists', async () => {
    readSession.mockReturnValue('user-1')
    getDecryptedTokenByUserId.mockImplementation(() => {
      throw new Error('User not found')
    })
    const res = await GET(req(), ctx)
    expect(res.status).toBe(401)
    expect(getDatabaseProperties).not.toHaveBeenCalled()
  })

  it('returns the property list for a valid session', async () => {
    readSession.mockReturnValue('user-1')
    getDecryptedTokenByUserId.mockReturnValue('tok')
    getDatabaseProperties.mockResolvedValue([
      { name: 'Name', type: 'title' },
      { name: 'When', type: 'date' },
    ])
    const res = await GET(req(), ctx)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      properties: [{ name: 'Name', type: 'title' }, { name: 'When', type: 'date' }],
    })
    expect(getDatabaseProperties).toHaveBeenCalledWith('tok', 'db1')
  })

  it('returns 502 without leaking detail when Notion fails', async () => {
    readSession.mockReturnValue('user-1')
    getDecryptedTokenByUserId.mockReturnValue('tok')
    getDatabaseProperties.mockRejectedValue(new Error('secret_ntn_leak 429'))
    const res = await GET(req(), ctx)
    expect(res.status).toBe(502)
    expect(JSON.stringify(await res.json())).not.toMatch(/secret_ntn_leak|429/)
  })
})
