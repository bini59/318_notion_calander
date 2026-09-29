import { NextRequest, NextResponse } from 'next/server'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const readSession = vi.fn()
const getUserByAuthId = vi.fn()

vi.mock('./session', () => ({ readSession }))
vi.mock('./users', () => ({ getUserByAuthId }))

let requireToken: typeof import('./require-token').requireToken

beforeAll(async () => {
  ;({ requireToken } = await import('./require-token'))
})

beforeEach(() => {
  readSession.mockReset()
  getUserByAuthId.mockReset()
})

const req = () => new NextRequest('http://localhost:3000/api/x')

describe('requireToken', () => {
  it('returns a 401 response when there is no session', () => {
    readSession.mockReturnValue(null)
    const r = requireToken(req())
    expect(r).toBeInstanceOf(NextResponse)
    expect((r as NextResponse).status).toBe(401)
    expect(getUserByAuthId).not.toHaveBeenCalled()
  })

  it('returns a 401 response when the auth user has not connected Notion', () => {
    readSession.mockReturnValue('user-1')
    getUserByAuthId.mockImplementation(() => {
      throw new Error('User not found')
    })
    const r = requireToken(req())
    expect(r).toBeInstanceOf(NextResponse)
    expect((r as NextResponse).status).toBe(401)
  })

  it('returns userId and accessToken for a valid session', () => {
    readSession.mockReturnValue('auth-1')
    getUserByAuthId.mockReturnValue({ id: 'internal-1', accessToken: 'tok' })
    expect(requireToken(req())).toEqual({ userId: 'internal-1', accessToken: 'tok' })
  })
})
