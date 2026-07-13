import { describe, expect, it } from 'vitest'
import { eventsToIcs } from './ics'
import type { CalendarEvent } from './events'

describe('eventsToIcs — RFC 5545 도메인 함정', () => {
  it('UID = notion page id 고정 (수정/삭제 반영 핵심)', () => {
    const events: CalendarEvent[] = [
      { uid: 'notion-page-abc123', title: 'x', start: '2026-03-05', allDay: true },
    ]
    expect(eventsToIcs(events)).toContain('UID:notion-page-abc123')
  })

  it('all-day DTEND는 exclusive: end 3/5 → DTEND 3/6 (오프바이원)', () => {
    const events: CalendarEvent[] = [
      { uid: 'p', title: 'Trip', start: '2026-03-03', end: '2026-03-05', allDay: true },
    ]
    const ics = eventsToIcs(events)
    expect(ics).toContain('DTSTART;VALUE=DATE:20260303')
    expect(ics).toContain('DTEND;VALUE=DATE:20260306') // 3/5 + 1일 exclusive
  })

  it('시간지정 이벤트는 DATE-TIME(UTC Z)로 직렬화 — VALUE=DATE 아님', () => {
    const events: CalendarEvent[] = [
      {
        uid: 'p',
        title: 'Meeting',
        start: '2026-07-13T09:00:00+09:00',
        end: '2026-07-13T10:00:00+09:00',
        allDay: false,
      },
    ]
    const ics = eventsToIcs(events)
    expect(ics).not.toContain('VALUE=DATE')
    // +09:00 → UTC 00:00 (instant 보존)
    expect(ics).toContain('DTSTART:20260713T000000Z')
    expect(ics).toContain('DTEND:20260713T010000Z')
  })

  it('timed event without end → DTSTART only, no error (as EventAttributes 캐스트 회귀 가드)', () => {
    // ics .d.ts는 end|duration을 강제하나 런타임은 start-only 허용 → 캐스트로 지탱.
    // ics 메이저 업글로 이 계약이 깨지면 여기서 잡는다.
    const ics = eventsToIcs([
      { uid: 'p', title: 'M', start: '2026-07-13T09:00:00+09:00', allDay: false },
    ])
    expect(ics).toContain('DTSTART:20260713T000000Z')
    expect(ics).not.toContain('DTEND')
  })

  it('title/description/location/url 매핑 포함', () => {
    const events: CalendarEvent[] = [
      {
        uid: 'p',
        title: 'Launch',
        start: '2026-07-13',
        allDay: true,
        description: 'agenda',
        location: 'Room A',
        url: 'https://notion.so/p',
      },
    ]
    const ics = eventsToIcs(events)
    expect(ics).toContain('SUMMARY:Launch')
    expect(ics).toContain('DESCRIPTION:agenda')
    expect(ics).toContain('LOCATION:Room A')
    expect(ics).toContain('URL:https://notion.so/p')
  })

  it('필수 컴포넌트 PRODID/VERSION:2.0/BEGIN:VEVENT 존재', () => {
    const ics = eventsToIcs([{ uid: 'p', title: 'x', start: '2026-07-13', allDay: true }])
    expect(ics).toContain('VERSION:2.0')
    expect(ics).toContain('PRODID')
    expect(ics).toContain('BEGIN:VEVENT')
  })
})
