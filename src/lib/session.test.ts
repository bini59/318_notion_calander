import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { USER_HEADER, readSession } from './session'

const req = (headers: Record<string, string> = {}) =>
  new NextRequest('http://localhost:3000/api/x', { headers })

describe('readSession', () => {
  it('returns the auth user id injected by proxy.ts', () => {
    expect(readSession(req({ [USER_HEADER]: 'user-42' }))).toBe('user-42')
  })

  it('returns null when the header is absent', () => {
    expect(readSession(req())).toBeNull()
  })
})
