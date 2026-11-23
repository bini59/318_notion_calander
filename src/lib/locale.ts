/** The supported UI languages. English is the default for unsupported languages. */
export type Locale = 'en' | 'ko'

/** Use Korean only when the highest-priority language preference is Korean. */
export function localeFromAcceptLanguage(header: string | null): Locale {
  if (!header) return 'en'
  const preferences = header.split(',').map((part, index) => {
    const [tag, ...parameters] = part.trim().split(';')
    const qualityParameter = parameters.find((parameter) => /^\s*q=/i.test(parameter))
    const quality = qualityParameter ? Number(qualityParameter.trim().slice(2)) : 1
    return { tag: tag.trim().toLowerCase(), quality, index }
  }).filter(({ tag, quality }) => /^(?:[a-z]{1,8}(?:-[a-z0-9]{1,8})*|\*)$/.test(tag) && quality > 0 && quality <= 1)
    .sort((a, b) => b.quality - a.quality || a.index - b.index)

  const preferredTag = preferences[0]?.tag
  return preferredTag === 'ko' || preferredTag?.startsWith('ko-') ? 'ko' : 'en'
}
