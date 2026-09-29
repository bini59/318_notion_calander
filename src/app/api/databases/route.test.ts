import { NextRequest } from 'next/server'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const readSession = vi.fn()
const getUserByAuthId = vi.fn()
const searchDatabases = vi.fn()

vi.mock('@/lib/session', () => ({ readSession }))
vi.mock('@/lib/users', () => ({ getUserByAuthId }))
vi.mock('@/lib/notion', () => ({ searchDatabases }))

let GET: typeof import('./route').GET

beforeAll(async () => {
  ;({ GET } = await import('./route'))
})

beforeEach(() => {
  readSession.mockReset()
  getUserByAuthId.mockReset()
  getUserByAuthId.mockReturnValue({ id: 'user-1', accessToken: 'tok' })
  searchDatabases.mockReset()
})

const req = () => new NextRequest('http://localhost:3000/api/databases')

describe('GET /api/databases', () => {
  it('returns 401 when there is no session', async () => {
    readSession.mockReturnValue(null)
    const res = await GET(req())
    expect(res.status).toBe(401)
    expect(searchDatabases).not.toHaveBeenCalled()
  })

  it('returns 401 when the session user no longer exists', async () => {
    readSession.mockReturnValue('user-1')
    getUserByAuthId.mockImplementation(() => {
      throw new Error('User not found')
    })
    const res = await GET(req())
    expect(res.status).toBe(401)
    expect(searchDatabases).not.toHaveBeenCalled()
  })

  it('returns the merged database list for a valid session', async () => {
    readSession.mockReturnValue('user-1')
    getUserByAuthId.mockReturnValue({ id: 'user-1', accessToken: 'tok' })
    searchDatabases.mockResolvedValue([
      { id: 'db1', title: 'A' },
      { id: 'db2', title: 'B' },
    ])
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ databases: [{ id: 'db1', title: 'A' }, { id: 'db2', title: 'B' }] })
    expect(getUserByAuthId).toHaveBeenCalledWith('user-1')
    expect(searchDatabases).toHaveBeenCalledWith('tok')
  })

  it('returns 502 without leaking detail when Notion fails', async () => {
    readSession.mockReturnValue('user-1')
    getUserByAuthId.mockReturnValue({ id: 'user-1', accessToken: 'tok' })
    searchDatabases.mockRejectedValue(new Error('secret_ntn_leak 429'))
    const res = await GET(req())
    expect(res.status).toBe(502)
    expect(JSON.stringify(await res.json())).not.toMatch(/secret_ntn_leak|429/)
  })
})
