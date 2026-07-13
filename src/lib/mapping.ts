import { z } from 'zod'

// Notion DB 속성 → 캘린더 필드 매핑 (이슈 #5). 값 = Notion 속성 "이름"(name).
// start 필수, title 자동(DB당 1개), 나머지 선택. 이 스키마가 Calendar.mapping JSON 계약.
// ponytail: Notion date 속성 자체가 range(start/end)를 가지므로 별도 `end`는 "종료일 전용
// 컬럼"을 쓰는 DB에서만 채운다. 단일 date의 range 해석은 .ics 생성(#6) 몫 — 여기선 저장만.
// 이벤트 필터(이슈 #13). MVP 상한: 타입 select/status/checkbox, 조건 equals/does_not_equal(AND만).
// 클라가 raw Notion filter JSON을 보내지 못하게 구조화된 {type,property,...}만 받는다 —
// Notion filter DSL로의 변환은 서버(notion.ts buildNotionFilter) 몫. 상한 초과(date/number/OR/
// 중첩)는 여기서 거부 = 임의 필터 빌더 금지. value는 자유 텍스트(옵션 목록 페치 안 함).
const conditionEnum = z.enum(['equals', 'does_not_equal'])
export const filterSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('select'), property: z.string().min(1), condition: conditionEnum, value: z.string().min(1) }),
  z.object({ type: z.literal('status'), property: z.string().min(1), condition: conditionEnum, value: z.string().min(1) }),
  z.object({ type: z.literal('checkbox'), property: z.string().min(1), value: z.boolean() }),
])
export type CalendarFilter = z.infer<typeof filterSchema>

export const mappingSchema = z.object({
  title: z.string().min(1),
  start: z.string().min(1),
  end: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  filters: z.array(filterSchema).optional(),
})

export type CalendarMapping = z.infer<typeof mappingSchema>

// notion-api 스킬: property는 이름별로 타입이 다르다. 자동감지/검증은 (name,type)만 본다.
export type NotionProperty = { name: string; type: string }

// title은 DB당 정확히 1개(SUMMARY 자동), start는 첫 date 속성(필수)을 기본값으로 제안.
// 나머지는 사용자 선택 몫이라 자동감지하지 않는다. 없으면 미포함 → Partial.
export function autoDetectMapping(properties: NotionProperty[]): Partial<CalendarMapping> {
  const title = properties.find((p) => p.type === 'title')?.name
  const start = properties.find((p) => p.type === 'date')?.name
  return {
    ...(title ? { title } : {}),
    ...(start ? { start } : {}),
  }
}

// 신뢰경계: 클라이언트가 보낸 매핑을 그대로 믿지 않는다. 백엔드가 Notion 속성을 재조회한
// 뒤 이 함수로 "매핑된 이름이 실제 존재 + 타입이 맞는지" 검증한다.
// 위반 시 사유 문자열(라우트가 400으로 변환), 통과 시 null.
export function validateMappingAgainstProperties(
  mapping: CalendarMapping,
  properties: NotionProperty[],
): string | null {
  const typeOf = (name: string): string | undefined =>
    properties.find((p) => p.name === name)?.type

  // title / start / end 는 타입까지 강제(SUMMARY·DTSTART·DTEND 의미론).
  // 'filters'는 배열이라 mapping[field] 유니온에 섞이면 안 됨 → 문자열 필드만 키로 좁힌다.
  const typed: [Extract<keyof CalendarMapping, 'title' | 'start' | 'end'>, string][] = [
    ['title', 'title'],
    ['start', 'date'],
    ['end', 'date'],
  ]
  for (const [field, expected] of typed) {
    const name = mapping[field]
    if (!name) continue // end는 선택
    const actual = typeOf(name)
    if (actual === undefined) return `매핑된 속성 '${name}'이(가) DB에 존재하지 않습니다`
    if (actual !== expected) {
      return `속성 '${name}'의 타입은 '${expected}'이어야 합니다 (현재: '${actual}')`
    }
  }

  // description / location 은 존재만 확인 — PLAN §5: text/select/url 등 타입이 다양해 관대하게.
  for (const field of ['description', 'location'] as const) {
    const name = mapping[field]
    if (!name) continue
    if (typeOf(name) === undefined) {
      return `매핑된 속성 '${name}'이(가) DB에 존재하지 않습니다`
    }
  }

  // filters(#13): 신뢰경계 — 클라가 보낸 필터를 그대로 Notion에 넘기지 않는다. 각 필터 property가
  // 실제 존재하고 타입이 선언한 type(select/status/checkbox)과 일치하는지 재확인. 위조/미존재 거부.
  for (const f of mapping.filters ?? []) {
    const actual = typeOf(f.property)
    if (actual === undefined) return `필터 속성 '${f.property}'이(가) DB에 존재하지 않습니다`
    if (actual !== f.type) {
      return `필터 속성 '${f.property}'의 타입은 '${f.type}'이어야 합니다 (현재: '${actual}')`
    }
  }

  return null
}
