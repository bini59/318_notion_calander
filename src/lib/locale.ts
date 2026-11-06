/** The supported UI languages. English is the default for unsupported languages. */
export type Locale = 'en' | 'ko'

/** Select the best supported language from an Accept-Language header. */
export function localeFromAcceptLanguage(header: string | null): Locale {
  if (!header) return 'en'
  const preferences = header.split(',').map((part, index) => {
    const [tag, ...parameters] = part.trim().split(';')
    const qualityParameter = parameters.find((parameter) => parameter.trim().startsWith('q='))
    const quality = qualityParameter ? Number(qualityParameter.trim().slice(2)) : 1
    return { tag: tag.toLowerCase(), quality, index }
  }).filter(({ quality }) => Number.isFinite(quality) && quality > 0 && quality <= 1)
    .sort((a, b) => b.quality - a.quality || a.index - b.index)

  for (const { tag } of preferences) {
    if (tag === 'ko' || tag.startsWith('ko-')) return 'ko'
    if (tag === 'en' || tag.startsWith('en-') || tag === '*') return 'en'
  }
  return 'en'
}
