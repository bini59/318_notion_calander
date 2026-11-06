import { describe, expect, it } from 'vitest'
import en from '@/messages/en.json'
import ko from '@/messages/ko.json'
import { serverErrorMessage } from './serverError'

describe('setup server errors', () => {
  it.each([['en', en], ['ko', ko]] as const)('localizes actionable validation errors in %s', (_, messages) => {
    const t = (key: keyof typeof en) => messages[key]
    expect(serverErrorMessage({ code: 'MAPPING_PROPERTY_MISSING', property: 'Due' }, 'fallback', t)).toContain('Due')
    const message = serverErrorMessage({ code: 'FILTER_PROPERTY_TYPE', property: 'Status', expected: 'status', actual: 'select' }, 'fallback', t)
    expect(message).toContain('Status')
    expect(message).toContain('status')
    expect(message).toContain('select')
    expect(message).toBe(messages.filterPropertyType.replace('{property}', 'Status').replace('{expected}', 'status').replace('{actual}', 'select'))
    expect(serverErrorMessage({ code: 'DATE_PROPERTY_REQUIRED' }, 'fallback', t)).toBe(messages.datePropertyRequired)
  })
  it('uses the fallback for unknown or malformed errors without exposing server text', () => {
    const t = (key: keyof typeof en) => en[key]
    expect(serverErrorMessage({ error: 'secret', code: 'UNKNOWN' }, 'fallback', t)).toBe('fallback')
    expect(serverErrorMessage({ code: 'MAPPING_PROPERTY_TYPE', property: 'Due' }, 'fallback', t)).toBe('fallback')
  })
})
