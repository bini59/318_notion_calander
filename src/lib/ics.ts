// CalendarEvent[] → RFC 5545 .ics 문자열 (이슈 #7). 순수 함수 — HTTP 없음.
// 라인폴딩(75옥텟)/이스케이프/CRLF/PRODID/VERSION은 `ics` 라이브러리가 처리 —
// RFC 5545 직접 구현 금지(반드시 틀리는 늪, ics-generation 스킬). 우리는 값만 올바르게 넘긴다.

import { createEvents, type DateArray, type EventAttributes } from 'ics'
import type { CalendarEvent } from './events'

// all-day 판별: events.ts와 동일 규칙(시간 성분 T 없음 = 날짜-only). start는 여기까지 보존된 Notion 원문.
// 날짜-only "YYYY-MM-DD"(앞 10자) → [y, m, d]. ics가 3-요소 배열을 VALUE=DATE로 출력한다.
function dateOnlyArray(dateStr: string): [number, number, number] {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number)
  return [y, m, d]
}

// all-day DTEND는 exclusive — 마지막 날 +1일 (Notion end=3/5 → DTEND=3/6). 이 도메인의
// 대표 오프바이원. UTC 기준 날짜 산술로 DST/로컬 오프셋 영향 차단.
function dateOnlyPlusOne(dateStr: string): [number, number, number] {
  const [y, m, d] = dateOnlyArray(dateStr)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + 1)
  return [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()]
}

// 시간지정: Notion 원문은 오프셋 포함(예: ...+09:00). 그 순간(instant)을 보존해 UTC 배열로 변환하고
// startInputType:'utc'로 넘긴다 → DTSTART가 ...Z로 나가 뷰어 로컬 tz 재해석(=임의 로컬 변환)을 막는다.
// ponytail: Notion은 timed date에 항상 오프셋/Z를 붙인다는 가정에 의존. 오프셋 없는
// "2026-07-13T09:00:00"이 들어오면 new Date()가 서버-로컬로 파싱→UTC 드리프트(instant 깨짐).
// Notion 입력에선 발생 안 하는 latent 케이스라 가드 생략 — 소스가 오프셋 없는 문자열을 흘리기
// 시작하면 floating(startInputType:'local') 분기로 승격.
function utcArray(iso: string): DateArray {
  const dt = new Date(iso)
  return [
    dt.getUTCFullYear(),
    dt.getUTCMonth() + 1,
    dt.getUTCDate(),
    dt.getUTCHours(),
    dt.getUTCMinutes(),
  ]
}

function toAttributes(event: CalendarEvent): EventAttributes {
  // UID = notion page id 고정 → 캘린더 앱이 수정/삭제를 같은 이벤트로 반영(도메인 1번 함정).
  const base = {
    uid: event.uid,
    title: event.title,
    ...(event.description ? { description: event.description } : {}),
    ...(event.location ? { location: event.location } : {}),
    ...(event.url ? { url: event.url } : {}),
  }

  if (event.allDay) {
    // end 없으면 start 하루짜리로 취급 → +1일 exclusive.
    const lastDay = event.end ?? event.start
    return {
      ...base,
      start: dateOnlyArray(event.start),
      end: dateOnlyPlusOne(lastDay),
    }
  }

  // end 없는 시간지정 이벤트는 DTSTART만(ics 런타임 허용) — .d.ts는 end|duration을 강제하나
  // 실제로는 start-only가 유효하므로 좁은 캐스트로 타입 갭 흡수.
  return {
    ...base,
    start: utcArray(event.start),
    startInputType: 'utc',
    ...(event.end ? { end: utcArray(event.end), endInputType: 'utc' as const } : {}),
  } as EventAttributes
}

export function eventsToIcs(events: CalendarEvent[], calName?: string): string {
  // calName → X-WR-CALNAME (캘린더 앱 표시 이름). ics가 헤더 폴딩/이스케이프 처리.
  const { error, value } = createEvents(
    events.map(toAttributes),
    calName ? { calName } : undefined,
  )
  // 라이브러리 검증 실패는 삼키지 않는다 — 라우트가 502로 흡수.
  if (error) throw error
  return value ?? ''
}
