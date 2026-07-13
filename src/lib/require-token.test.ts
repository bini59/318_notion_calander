import { NextRequest, NextResponse } from 'next/server'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const readSession = vi.fn()
const getDecryptedTokenByUserId = vi.fn()

vi.mock('./session', () => ({ readSession }))
vi.mock('./users', () => ({ getDecryptedTokenByUserId }))

let requireToken: typeof import('./require-token').requireToken

beforeAll(async () => {
  ;({ requireToken } = await import('./require-token'))
})

beforeEach(() => {
  readSession.mockReset()
  getDecryptedTokenByUserId.mockReset()
})

const req = () => new NextRequest('http://localhost:3000/api/x')

describe('requireToken', () => {
  it('returns a 401 response when there is no session', () => {
    readSession.mockReturnValue(null)
    const r = requireToken(req())
    expect(r).toBeInstanceOf(NextResponse)
    expect((r as NextResponse).status).toBe(401)
    expect(getDecryptedTokenByUserId).not.toHaveBeenCalled()
  })

  it('returns a 401 response when the session user no longer exists', () => {
    readSession.mockReturnValue('user-1')
    getDecryptedTokenByUserId.mockImplementation(() => {
      throw new Error('User not found')
    })
    const r = requireToken(req())
    expect(r).toBeInstanceOf(NextResponse)
    expect((r as NextResponse).status).toBe(401)
  })

  it('returns userId and accessToken for a valid session', () => {
    readSession.mockReturnValue('user-1')
    getDecryptedTokenByUserId.mockReturnValue('tok')
    expect(requireToken(req())).toEqual({ userId: 'user-1', accessToken: 'tok' })
  })
})
