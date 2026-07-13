import { describe, expect, it } from 'vitest'
import { validateEnv } from './env'

const full = {
  NOTION_CLIENT_ID: 'cid',
  NOTION_CLIENT_SECRET: 'secret',
  TOKEN_ENC_KEY: 'enc-key',
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

  it('names every missing variable at once', () => {
    expect(() => validateEnv({})).toThrow(
      /NOTION_CLIENT_ID.*NOTION_CLIENT_SECRET.*TOKEN_ENC_KEY.*BASE_URL.*DATABASE_URL/,
    )
  })
})
