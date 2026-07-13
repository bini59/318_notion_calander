// Notion 페이지 → 캘린더 이벤트 중간표현 (이슈 #6). 순수 매퍼 — HTTP 없음, 저장 없음.
// #7(.ics 직렬화)이 소비할 필드를 여기서 확정한다. 계약: notion-api / ics-generation 스킬.
// 날짜는 Notion 원문 문자열 그대로 보존 — Date/UTC 변환은 #7 몫(all-day 오프바이원·타임존 방어).

import type { NotionPage, NotionPropertyValue } from './notion'
import type { CalendarMapping } from './mapping'

// #7이 소비하는 중간표현. uid=page.id 고정(캘린더 앱 수정/삭제 반영 핵심, ics-generation 스킬).
// start/end는 Notion date 원문 문자열(YYYY-MM-DD 또는 오프셋 포함 datetime).
export type CalendarEvent = {
  uid: string
  title: string
  start: string
  end?: string
  allDay: boolean
  description?: string
  location?: string
  url?: string
}

// title / rich_text: plain_text 배열(빈 배열 가능) → join. 옵셔널 체이닝 필수(notion-api 스킬).
function extractPlainText(prop: NotionPropertyValue | undefined): string | undefined {
  const arr = (prop?.title ?? prop?.rich_text) as { plain_text?: string }[] | undefined
  if (!Array.isArray(arr)) return undefined
  return arr.map((t) => t.plain_text ?? '').join('')
}

// date 속성의 { start, end } 부분. end는 nullable(범위 미지정 시 null).
function extractDate(
  prop: NotionPropertyValue | undefined,
): { start?: string; end?: string } | undefined {
  const date = prop?.date as { start?: string; end?: string | null } | null | undefined
  if (!date) return undefined
  return { start: date.start, end: date.end ?? undefined }
}

// select/status/multi_select/url/email/phone 등 텍스트성 속성을 문자열로 (mapping.ts는
// description/location에 이 타입들을 관대하게 허용 → 여기서 유실되면 값이 조용히 사라진다).
// 타입별 shape 차이를 옵셔널 체이닝으로 흡수.
// 모르는/미지원 타입이면 undefined (크래시 금지).
function extractText(prop: NotionPropertyValue | undefined): string | undefined {
  if (!prop) return undefined
  const plain = extractPlainText(prop)
  if (plain !== undefined) return plain
  const select = (prop.select ?? prop.status) as { name?: string } | null | undefined
  if (select?.name) return select.name
  const multi = prop.multi_select as { name?: string }[] | undefined
  if (Array.isArray(multi)) return multi.map((o) => o.name ?? '').join(', ')
  for (const key of ['url', 'email', 'phone_number'] as const) {
    const v = prop[key]
    if (typeof v === 'string') return v
  }
  return undefined
}

// date.start에 시간 성분(T)이 없으면(YYYY-MM-DD, 길이 10) all-day. datetime이면 오프셋 보존.
function isAllDay(start: string): boolean {
  return !start.includes('T')
}

// 순수 매퍼: 매핑된 속성만 추출. mapping.start가 비어있는 페이지는 스킵(이슈 완료 조건).
export function pagesToEvents(pages: NotionPage[], mapping: CalendarMapping): CalendarEvent[] {
  const events: CalendarEvent[] = []

  for (const page of pages) {
    const props = page.properties ?? {}
    const startDate = extractDate(props[mapping.start])
    const start = startDate?.start
    if (!start) continue // start 없는 페이지는 이벤트로 만들지 않는다.

    // end: 전용 컬럼(mapping.end)이 있으면 그 date.start, 없으면 start 속성 range의 .end.
    const end = mapping.end
      ? extractDate(props[mapping.end])?.start
      : startDate.end

    events.push({
      uid: page.id,
      title: extractPlainText(props[mapping.title]) ?? '',
      start,
      ...(end ? { end } : {}),
      allDay: isAllDay(start),
      ...(mapping.description
        ? { description: extractText(props[mapping.description]) }
        : {}),
      ...(mapping.location ? { location: extractText(props[mapping.location]) } : {}),
      ...(page.url ? { url: page.url } : {}),
    })
  }

  return events
}
