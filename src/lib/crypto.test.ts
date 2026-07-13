import { beforeAll, describe, expect, it, vi } from 'vitest'

let crypto: typeof import('./crypto')

beforeAll(async () => {
  process.env.NOTION_CLIENT_ID = 'cid'
  process.env.NOTION_CLIENT_SECRET = 'secret'
  process.env.TOKEN_ENC_KEY = 'ab'.repeat(32)
  process.env.BASE_URL = 'http://localhost:3000'
  process.env.DATABASE_URL = './data/app.db'
  crypto = await import('./crypto')
})

describe('encrypt / decrypt', () => {
  it('round-trips a Notion access token', () => {
    const token = 'secret_ntn_abc123'
    expect(crypto.decrypt(crypto.encrypt(token))).toBe(token)
  })

  it('uses a fresh IV per call (same plaintext, different ciphertext)', () => {
    expect(crypto.encrypt('x')).not.toBe(crypto.encrypt('x'))
  })

  it('rejects tampered ciphertext (GCM auth)', () => {
    const payload = crypto.encrypt('secret')
    const [iv, tag, ct] = payload.split('.')
    const flipped = ct[0] === 'A' ? 'B' : 'A'
    expect(() => crypto.decrypt([iv, tag, flipped + ct.slice(1)].join('.'))).toThrow()
  })

  it('rejects garbage payloads', () => {
    expect(() => crypto.decrypt('not-a-payload')).toThrow()
  })

  it('rejects payloads with extra segments', () => {
    expect(() => crypto.decrypt(crypto.encrypt('secret') + '.garbage')).toThrow(/payload format/)
  })

  it('fails to decrypt under a different key', async () => {
    const payload = crypto.encrypt('secret')
    vi.resetModules()
    process.env.TOKEN_ENC_KEY = 'cd'.repeat(32)
    const other = await import('./crypto')
    expect(() => other.decrypt(payload)).toThrow()
  })
})

describe('generateFeedToken', () => {
  it('is 32 random bytes as base64url', () => {
    const t = crypto.generateFeedToken()
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('never repeats', () => {
    const tokens = new Set(Array.from({ length: 1000 }, crypto.generateFeedToken))
    expect(tokens.size).toBe(1000)
  })
})
