import { describe, expect, it } from 'vitest'
import { localeFromAcceptLanguage } from './locale'

describe('localeFromAcceptLanguage', () => {
  it('defaults to English for absent or unsupported languages', () => {
    expect(localeFromAcceptLanguage(null)).toBe('en')
    expect(localeFromAcceptLanguage('fr-FR,fr;q=0.9')).toBe('en')
  })

  it('honors language preferences and regional variants', () => {
    expect(localeFromAcceptLanguage('ko-KR,ko;q=0.9,en;q=0.8')).toBe('ko')
    expect(localeFromAcceptLanguage('en-US,en;q=0.9,ko;q=0.8')).toBe('en')
    expect(localeFromAcceptLanguage('en;q=0.5,ko;q=0.9')).toBe('ko')
    expect(localeFromAcceptLanguage('ko;q=0,en;q=0.5')).toBe('en')
  })
})
