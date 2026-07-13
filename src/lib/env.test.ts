import { describe, expect, it } from 'vitest'
import { validateEnv } from './env'

const full = {
  NOTION_CLIENT_ID: 'cid',
  NOTION_CLIENT_SECRET: 'secret',
  TOKEN_ENC_KEY: 'ab'.repeat(32),
  BASE_URL: 'http://localhost:3000',
  DATABASE_URL: './data/app.db',
}

describe('validateEnv', () => {
  it('returns the validated values when all 5 keys are set', () => {
    expect(validateEnv(full)).toEqual(full)
  })

  it('throws naming the missing variable', () => {
    expect(() => validateEnv({ ...full, TOKEN_ENC_KEY: undefined })).toThrow(/TOKEN_ENC_KEY/)
  })

  it('treats empty strings as missing', () => {
    expect(() => validateEnv({ ...full, BASE_URL: '' })).toThrow(/BASE_URL/)
  })

  it('rejects a TOKEN_ENC_KEY that is not 64 hex chars, telling how to generate one', () => {
    expect(() => validateEnv({ ...full, TOKEN_ENC_KEY: 'too-short' })).toThrow(
      /TOKEN_ENC_KEY.*openssl rand -hex 32/,
    )
  })

  it('rejects a malformed BASE_URL', () => {
    expect(() => validateEnv({ ...full, BASE_URL: 'not a url' })).toThrow(/BASE_URL/)
  })

  it('names every missing variable at once', () => {
    expect(() => validateEnv({})).toThrow(
      /NOTION_CLIENT_ID.*NOTION_CLIENT_SECRET.*TOKEN_ENC_KEY.*BASE_URL.*DATABASE_URL/,
    )
  })
})
