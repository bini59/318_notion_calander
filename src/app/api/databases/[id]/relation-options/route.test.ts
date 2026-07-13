import { NextRequest } from 'next/server'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const readSession = vi.fn()
const getDecryptedTokenByUserId = vi.fn()
const getDatabaseProperties = vi.fn()
const queryRelationPages = vi.fn()

vi.mock('@/lib/session', () => ({ readSession }))
vi.mock('@/lib/users', () => ({ getDecryptedTokenByUserId }))
vi.mock('@/lib/notion', () => ({ getDatabaseProperties, queryRelationPages }))

let GET: typeof import('./route').GET

beforeAll(async () => {
  ;({ GET } = await import('./route'))
})

beforeEach(() => {
  readSession.mockReset()
  getDecryptedTokenByUserId.mockReset()
  getDatabaseProperties.mockReset()
  queryRelationPages.mockReset()
})

const req = (property?: string) =>
  new NextRequest(
    `http://localhost:3000/api/databases/db1/relation-options${property ? `?property=${property}` : ''}`,
  )
const ctx = { params: Promise.resolve({ id: 'db1' }) }

describe('GET /api/databases/[id]/relation-options', () => {
  it('returns 401 when there is no session', async () => {
    readSession.mockReturnValue(null)
    const res = await GET(req('Project'), ctx)
    expect(res.status).toBe(401)
    expect(getDatabaseProperties).not.toHaveBeenCalled()
  })

  it('returns 400 when the property query param is missing', async () => {
    readSession.mockReturnValue('user-1')
    getDecryptedTokenByUserId.mockReturnValue('tok')
    const res = await GET(req(), ctx)
    expect(res.status).toBe(400)
    expect(getDatabaseProperties).not.toHaveBeenCalled()
  })

  it('re-derives the related DB id server-side and returns the name options', async () => {
    readSession.mockReturnValue('user-1')
    getDecryptedTokenByUserId.mockReturnValue('tok')
    getDatabaseProperties.mockResolvedValue([
      { name: 'Project', type: 'relation', relatedDatabaseId: 'reldb' },
      { name: 'When', type: 'date' },
    ])
    queryRelationPages.mockResolvedValue([
      { id: 'p1', title: 'Alpha' },
      { id: 'p2', title: 'Beta' },
    ])
    const res = await GET(req('Project'), ctx)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ options: [{ id: 'p1', title: 'Alpha' }, { id: 'p2', title: 'Beta' }] })
    // 신뢰경계: 클라가 넘긴 DB id가 아니라 서버가 재도출한 relatedDatabaseId로 조회.
    expect(queryRelationPages).toHaveBeenCalledWith('tok', 'reldb')
  })

  it('returns 400 for a non-relation property (no arbitrary DB query)', async () => {
    readSession.mockReturnValue('user-1')
    getDecryptedTokenByUserId.mockReturnValue('tok')
    getDatabaseProperties.mockResolvedValue([{ name: 'Place', type: 'select', options: [{ name: 'HQ' }] }])
    const res = await GET(req('Place'), ctx)
    expect(res.status).toBe(400)
    expect(queryRelationPages).not.toHaveBeenCalled()
  })

  it('returns 400 for a property that does not exist', async () => {
    readSession.mockReturnValue('user-1')
    getDecryptedTokenByUserId.mockReturnValue('tok')
    getDatabaseProperties.mockResolvedValue([{ name: 'When', type: 'date' }])
    const res = await GET(req('Ghost'), ctx)
    expect(res.status).toBe(400)
    expect(queryRelationPages).not.toHaveBeenCalled()
  })

  it('returns 502 without leaking detail when Notion fails', async () => {
    readSession.mockReturnValue('user-1')
    getDecryptedTokenByUserId.mockReturnValue('tok')
    getDatabaseProperties.mockRejectedValue(new Error('secret_ntn_leak 429'))
    const res = await GET(req('Project'), ctx)
    expect(res.status).toBe(502)
    expect(JSON.stringify(await res.json())).not.toMatch(/secret_ntn_leak|429/)
  })
})
