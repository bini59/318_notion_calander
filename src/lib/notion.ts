// Notion 데이터 API — raw fetch (notion-oauth.ts와 동일 패턴, @notionhq/client 미도입).
// 계약: notion-api 스킬. 이 파일이 막는 1번 도메인 버그 = search 페이지네이션 누락.

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

// 피드 요청마다 DB 전체 페이지를 실시간 조회한다(저장 없음, Notion이 원본). search와 동일한
// do-while 페이지네이션 — has_more가 false일 때까지 next_cursor로 루프. 이 루프를 빼면 100개
// 초과 DB가 조용히 잘린다 (notion-api 스킬, 협상 불가 = 이 도메인 1번 버그).
export async function queryDatabase(
  accessToken: string,
  databaseId: string,
): Promise<NotionPage[]> {
  const pages: NotionPage[] = []
  let cursor: string | undefined

  do {
    const res = await fetch(`${API}/databases/${databaseId}/query`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        page_size: 100,
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

// DB retrieve로 속성 목록을 (이름, 타입) 배열로 평탄화한다. 매핑 자동감지·검증의 원본.
// Notion `properties`는 이름을 키로 갖는 객체 → 필드 매핑 UI가 다루기 쉽게 배열로 편다.
export async function getDatabaseProperties(
  accessToken: string,
  databaseId: string,
): Promise<{ name: string; type: string }[]> {
  const res = await fetch(`${API}/databases/${databaseId}`, {
    headers: authHeaders(accessToken),
    signal: AbortSignal.timeout(10_000),
  })
  // 본문에 상세/토큰 흔적이 있을 수 있어 status만 표면화.
  if (!res.ok) throw new Error(`Notion database retrieve failed: ${res.status}`)

  const { properties } = (await res.json()) as { properties: Record<string, { type: string }> }
  return Object.entries(properties ?? {}).map(([name, { type }]) => ({ name, type }))
}
