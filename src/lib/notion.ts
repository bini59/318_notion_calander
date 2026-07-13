// Notion 데이터 API — raw fetch (notion-oauth.ts와 동일 패턴, @notionhq/client 미도입).
// 계약: notion-api 스킬. 이 파일이 막는 1번 도메인 버그 = search 페이지네이션 누락.

import type { CalendarFilter } from './mapping'

const NOTION_VERSION = '2022-06-28'
const API = 'https://api.notion.com/v1'

type RichText = { plain_text?: string }
type SearchResult = { id: string; title?: RichText[] }
type SearchResponse = { results: SearchResult[]; has_more: boolean; next_cursor: string | null }

// Notion property는 타입마다 JSON shape이 제각각(title/date/rich_text/select/url...).
// 엄격 union으로 좁히면 미지원 타입에서 깨지므로 느슨한 인덱스 타입 + 추출 시 옵셔널 체이닝
// (notion-api 스킬: property 타입별 추출). 값 해석은 events.ts 몫.
export type NotionPropertyValue = { type?: string; [k: string]: unknown }
export type NotionPage = {
  id: string
  url?: string
  properties: Record<string, NotionPropertyValue>
}
type QueryResponse = { results: NotionPage[]; has_more: boolean; next_cursor: string | null }

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Notion-Version': NOTION_VERSION,
  }
}

// title 배열은 빈 배열/무제목 가능 → 옵셔널 체이닝 + join으로 안전 처리 (notion-api 스킬).
function extractTitle(db: SearchResult): string {
  return db.title?.map((t) => t.plain_text ?? '').join('') ?? ''
}

// 통합에 공유된 database 목록. has_more가 false일 때까지 next_cursor로 루프한다 —
// 이 루프를 빼면 100개 초과 DB가 조용히 사라진다 (notion-api 스킬, 협상 불가).
export async function searchDatabases(
  accessToken: string,
): Promise<{ id: string; title: string }[]> {
  const databases: { id: string; title: string }[] = []
  let cursor: string | undefined

  do {
    const res = await fetch(`${API}/search`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        filter: { value: 'database', property: 'object' },
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    })
    // 본문에 상세/토큰 흔적이 있을 수 있어 status만 표면화.
    if (!res.ok) throw new Error(`Notion search failed: ${res.status}`)

    const page = (await res.json()) as SearchResponse
    for (const db of page.results) {
      databases.push({ id: db.id, title: extractTitle(db) })
    }
    cursor = page.has_more && page.next_cursor ? page.next_cursor : undefined
  } while (cursor)

  return databases
}

// 구조화된 필터(#13)를 Notion query API의 filter DSL로 변환한다. 클라가 raw filter JSON을
// 보내지 못하게 서버측에서만 조립 — MVP 상한(select/status/checkbox, equals/does_not_equal, AND).
// select/status: { property, [type]: { [condition]: value } }, checkbox: { property, checkbox:{equals} }.
// 필터 0개면 undefined 반환 → 빈 {and:[]} 전송 금지(Notion이 거부). 라우트가 이 값을 queryDatabase에 넘긴다.
// relation(#16): contains/does_not_contain → { relation: { [cond]: pageId } },
// is_empty/is_not_empty → { relation: { [cond]: true } }(value 무시). (notion-api 스킬: relation
// filter는 관련 페이지 UUID를 값으로 받는다 — 이름이 아니라 id. is_empty류는 boolean 플래그.)
export function buildNotionFilter(filters?: CalendarFilter[]): object | undefined {
  if (!filters?.length) return undefined
  return {
    and: filters.map((f) =>
      f.type === 'checkbox'
        ? { property: f.property, checkbox: { equals: f.value } }
        : f.type === 'relation'
          ? {
              property: f.property,
              relation:
                f.condition === 'is_empty' || f.condition === 'is_not_empty'
                  ? { [f.condition]: true }
                  : { [f.condition]: f.value },
            }
          : { property: f.property, [f.type]: { [f.condition]: f.value } },
    ),
  }
}

// 피드 요청마다 DB 전체 페이지를 실시간 조회한다(저장 없음, Notion이 원본). search와 동일한
// do-while 페이지네이션 — has_more가 false일 때까지 next_cursor로 루프. 이 루프를 빼면 100개
// 초과 DB가 조용히 잘린다 (notion-api 스킬, 협상 불가 = 이 도메인 1번 버그).
// filter(#13)는 buildNotionFilter가 만든 DSL 객체 — 있으면 매 페이지 요청 body에 유지(페이지네이션 병행).
export async function queryDatabase(
  accessToken: string,
  databaseId: string,
  filter?: object,
): Promise<NotionPage[]> {
  const pages: NotionPage[] = []
  let cursor: string | undefined

  do {
    const res = await fetch(`${API}/databases/${databaseId}/query`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        page_size: 100,
        ...(filter ? { filter } : {}),
        ...(cursor ? { start_cursor: cursor } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    })
    // 본문에 상세/토큰 흔적이 있을 수 있어 status만 표면화.
    if (!res.ok) throw new Error(`Notion query failed: ${res.status}`)

    const page = (await res.json()) as QueryResponse
    pages.push(...page.results)
    cursor = page.has_more && page.next_cursor ? page.next_cursor : undefined
  } while (cursor)

  return pages
}

// 관련 DB 페이지의 제목 = type==='title'인 property의 rich_text join. title property 이름은 DB마다
// 다르므로 타입으로 찾는다(notion-api 스킬). 무제목/타이틀 부재는 '' 반환(드롭다운이 '(제목 없음)' 폴백).
function extractPageTitle(page: NotionPage): string {
  const titleProp = Object.values(page.properties).find((p) => p.type === 'title')
  const rich = (titleProp?.title as RichText[] | undefined) ?? []
  return rich.map((t) => t.plain_text ?? '').join('')
}

// relation 필터(#16) 값 선택용: 관련 DB의 페이지를 {id, title}로 반환한다. relation 값은 사람이 못
// 고르는 UUID라 이름 드롭다운의 원본이 된다. 신뢰경계: databaseId는 라우트가 relation property의
// relatedDatabaseId에서 서버측으로 재도출한 값만 넘어온다(클라 임의 DB 조회 차단).
// ponytail: 상위 100개 캡 — 단일 page_size:100 요청, do-while 페이지네이션 없음(피드용 queryDatabase와
// 의도적으로 다름, 큰 관련 DB 방어). 100개 초과면 Notion 기본 정렬 상위 100개만. 검색어 파라미터/
// 페이지네이션은 100+ 실사용 요구 시 추가.
export async function queryRelationPages(
  accessToken: string,
  databaseId: string,
): Promise<{ id: string; title: string }[]> {
  const res = await fetch(`${API}/databases/${databaseId}/query`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ page_size: 100 }),
    signal: AbortSignal.timeout(10_000),
  })
  // 본문에 상세/토큰 흔적이 있을 수 있어 status만 표면화.
  if (!res.ok) throw new Error(`Notion relation query failed: ${res.status}`)

  const { results } = (await res.json()) as QueryResponse
  return results.map((page) => ({ id: page.id, title: extractPageTitle(page) }))
}

// DB retrieve로 속성 목록을 (이름, 타입, [옵션]) 배열로 평탄화한다. 매핑 자동감지·검증의 원본.
// Notion `properties`는 이름을 키로 갖는 객체 → 필드 매핑 UI가 다루기 쉽게 배열로 편다.
// select/status/multi_select만 옵션 목록을 실어 필터 값 드롭다운(#15)에 쓴다 — 추가 API 호출
// 없이 이미 받은 retrieve 응답의 `properties[name].<type>.options`에서 name만 추출. status는
// options+groups를 갖지만 options만 쓴다(그룹은 옵션의 상위 묶음일 뿐, 값은 옵션 name). 옵셔널
// 체이닝으로 방어 → 그 외 타입은 options undefined(자동감지·검증은 name/type만 봐 하위호환).
// relation(#16)은 `relation.database_id`(관련 DB)를 실어 이름 드롭다운 엔드포인트가 서버측에서
// 재도출할 수 있게 한다 — 옵셔널이라 기존 (name,type,options) 소비자는 무영향.
type PropertyDef = {
  type: string
  select?: { options?: { name: string }[] }
  status?: { options?: { name: string }[] }
  multi_select?: { options?: { name: string }[] }
  relation?: { database_id?: string }
}

export async function getDatabaseProperties(
  accessToken: string,
  databaseId: string,
): Promise<{ name: string; type: string; options?: { name: string }[]; relatedDatabaseId?: string }[]> {
  const res = await fetch(`${API}/databases/${databaseId}`, {
    headers: authHeaders(accessToken),
    signal: AbortSignal.timeout(10_000),
  })
  // 본문에 상세/토큰 흔적이 있을 수 있어 status만 표면화.
  if (!res.ok) throw new Error(`Notion database retrieve failed: ${res.status}`)

  const { properties } = (await res.json()) as { properties: Record<string, PropertyDef> }
  return Object.entries(properties ?? {}).map(([name, def]) => {
    const rawOptions = def[def.type as 'select' | 'status' | 'multi_select']?.options
    const options = rawOptions?.map((o) => ({ name: o.name }))
    const relatedDatabaseId = def.relation?.database_id
    return {
      name,
      type: def.type,
      ...(options ? { options } : {}),
      ...(relatedDatabaseId ? { relatedDatabaseId } : {}),
    }
  })
}
