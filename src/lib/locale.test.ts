import { describe, expect, it } from 'vitest'
import { localeFromAcceptLanguage } from './locale'

describe('localeFromAcceptLanguage', () => {
  it('defaults to English for absent or unsupported languages', () => {
    expect(localeFromAcceptLanguage(null)).toBe('en')
    expect(localeFromAcceptLanguage('fr-FR,fr;q=0.9')).toBe('en')
  })

  it('defaults to English when an unsupported language outranks Korean', () => {
    expect(localeFromAcceptLanguage('fr-FR,fr;q=0.9,ko;q=0.8')).toBe('en')
    expect(localeFromAcceptLanguage('ko;q=0.8,fr;q=0.9')).toBe('en')
    expect(localeFromAcceptLanguage('fr,ko')).toBe('en')
    expect(localeFromAcceptLanguage('ko,fr')).toBe('ko')
  })

  it('honors language preferences and regional variants', () => {
    expect(localeFromAcceptLanguage('ko-KR,ko;q=0.9,en;q=0.8')).toBe('ko')
    expect(localeFromAcceptLanguage('en-US,en;q=0.9,ko;q=0.8')).toBe('en')
    expect(localeFromAcceptLanguage('en;q=0.5,ko;q=0.9')).toBe('ko')
    expect(localeFromAcceptLanguage('ko-KR ; Q=0.9,en;q=0.8')).toBe('ko')
    expect(localeFromAcceptLanguage('ko;q=0,en;q=0.5')).toBe('en')
    expect(localeFromAcceptLanguage(',ko-,fr;q=0,ko;q=0.8')).toBe('ko')
  })
})
