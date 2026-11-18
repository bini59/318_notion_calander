import type en from '@/messages/en.json'

type Translate = (key: keyof typeof en) => string

// Only render recognized validation codes and their expected fields, never arbitrary server errors.
export function serverErrorMessage(data: unknown, fallback: string, t: Translate): string {
  if (!data || typeof data !== 'object') return fallback
  const issue = data as Record<string, unknown>
  if (issue.code === 'INVALID_MAPPING') return t('invalidMapping')
  if (issue.code === 'DATE_PROPERTY_REQUIRED') return t('datePropertyRequired')
  const keys = {
    MAPPING_PROPERTY_MISSING: 'mappingPropertyMissing',
    FILTER_PROPERTY_MISSING: 'filterPropertyMissing',
    MAPPING_PROPERTY_TYPE: 'mappingPropertyType',
    FILTER_PROPERTY_TYPE: 'filterPropertyType',
  } as const
  if (typeof issue.code !== 'string' || !Object.hasOwn(keys, issue.code) || typeof issue.property !== 'string') return fallback
  const key = keys[issue.code as keyof typeof keys]
  const isType = issue.code.endsWith('_TYPE')
  if (isType && (typeof issue.expected !== 'string' || typeof issue.actual !== 'string')) return fallback
  const values: Record<string, string> = { property: issue.property, expected: String(issue.expected), actual: String(issue.actual) }
  return t(key).replace(/\{(property|expected|actual)\}/g, (_, name: string) => values[name])
}
