import { describe, expect, it } from 'vitest'
import { pagesToEvents } from './events'
import type { NotionPage } from './notion'
import type { CalendarMapping } from './mapping'

const mapping: CalendarMapping = {
  title: 'Name',
  start: 'When',
  description: 'Notes',
  location: 'Where',
}

// property 타입별 shape을 그대로 재현한 페이지 팩토리.
function page(id: string, props: Record<string, unknown>): NotionPage {
  return { id, url: `https://notion.so/${id}`, properties: props as NotionPage['properties'] }
}

describe('pagesToEvents — property extraction', () => {
  it('extracts title/date range/rich_text/select by type', () => {
    const pages = [
      page('page-1', {
        Name: { type: 'title', title: [{ plain_text: 'Sprint ' }, { plain_text: 'Review' }] },
        When: { type: 'date', date: { start: '2026-07-13T09:00:00+09:00', end: '2026-07-13T10:00:00+09:00' } },
        Notes: { type: 'rich_text', rich_text: [{ plain_text: 'agenda' }] },
        Where: { type: 'select', select: { name: 'Room A' } },
      }),
    ]
    expect(pagesToEvents(pages, mapping)).toEqual([
      {
        uid: 'page-1',
        title: 'Sprint Review',
        start: '2026-07-13T09:00:00+09:00',
        end: '2026-07-13T10:00:00+09:00',
        allDay: false,
        description: 'agenda',
        location: 'Room A',
        url: 'https://notion.so/page-1',
      },
    ])
  })

  it('marks date-only (length 10, no T) as all-day; datetime preserves offset', () => {
    const pages = [
      page('all-day', { Name: { title: [] }, When: { date: { start: '2026-07-13' } } }),
      page('timed', { Name: { title: [] }, When: { date: { start: '2026-07-13T09:00:00+09:00' } } }),
    ]
    const events = pagesToEvents(pages, mapping)
    expect(events[0].allDay).toBe(true)
    expect(events[1].allDay).toBe(false)
    expect(events[1].start).toBe('2026-07-13T09:00:00+09:00') // 오프셋 보존
  })

  it('skips pages whose mapped start date is empty (완료 조건)', () => {
    const pages = [
      page('no-date', { Name: { title: [{ plain_text: 'orphan' }] }, When: { date: null } }),
      page('missing-prop', { Name: { title: [{ plain_text: 'orphan2' }] } }),
      page('ok', { Name: { title: [{ plain_text: 'kept' }] }, When: { date: { start: '2026-07-13' } } }),
    ]
    const events = pagesToEvents(pages, mapping)
    expect(events.map((e) => e.uid)).toEqual(['ok'])
  })

  it('uid === page id, url === page.url (안정 UID)', () => {
    const pages = [page('abc-123', { Name: { title: [] }, When: { date: { start: '2026-07-13' } } })]
    const [event] = pagesToEvents(pages, mapping)
    expect(event.uid).toBe('abc-123')
    expect(event.url).toBe('https://notion.so/abc-123')
  })

  it('does not crash on unknown/unsupported property types', () => {
    const pages = [
      page('weird', {
        Name: { type: 'formula', formula: { type: 'number', number: 42 } },
        When: { date: { start: '2026-07-13' } },
        Notes: { type: 'files', files: [{ name: 'x.pdf' }] },
        Where: { type: 'people', people: [{ id: 'u1' }] },
      }),
    ]
    const [event] = pagesToEvents(pages, mapping)
    expect(event.title).toBe('') // 미지원 title 타입 → 빈 문자열
    expect(event.description).toBeUndefined()
    expect(event.location).toBeUndefined()
  })

  it('extracts multi_select (join) and status text properties', () => {
    const pages = [
      page('tagged', {
        Name: { title: [{ plain_text: 'launch' }] },
        When: { date: { start: '2026-07-13' } },
        Notes: { type: 'multi_select', multi_select: [{ name: 'urgent' }, { name: 'ops' }] },
        Where: { type: 'status', status: { name: 'In progress' } },
      }),
    ]
    const [event] = pagesToEvents(pages, mapping)
    expect(event.description).toBe('urgent, ops')
    expect(event.location).toBe('In progress')
  })

  it('uses a dedicated end column when mapping.end is set', () => {
    const pages = [
      page('ranged', {
        Name: { title: [{ plain_text: 'trip' }] },
        When: { date: { start: '2026-07-13' } },
        Until: { date: { start: '2026-07-15' } },
      }),
    ]
    const [event] = pagesToEvents(pages, { title: 'Name', start: 'When', end: 'Until' })
    expect(event.start).toBe('2026-07-13')
    expect(event.end).toBe('2026-07-15')
  })
})

describe('pagesToEvents — descriptionSource body (#17)', () => {
  const bodyMapping: CalendarMapping = { title: 'Name', start: 'When', descriptionSource: 'body' }

  it("uses the injected body map (not the property) when source is 'body'", () => {
    const pages = [
      page('pg1', {
        Name: { title: [{ plain_text: 'Standup' }] },
        When: { date: { start: '2026-07-13' } },
        Notes: { type: 'rich_text', rich_text: [{ plain_text: 'IGNORED property text' }] },
      }),
    ]
    const bodyTextByPage = new Map([['pg1', 'first block\nsecond block']])
    const [event] = pagesToEvents(pages, bodyMapping, bodyTextByPage)
    expect(event.description).toBe('first block\nsecond block')
  })

  it('yields undefined description on a map miss (no body fetched for that page)', () => {
    const pages = [page('pg1', { Name: { title: [] }, When: { date: { start: '2026-07-13' } } })]
    const [event] = pagesToEvents(pages, bodyMapping, new Map())
    expect(event.description).toBeUndefined()
  })

  it("leaves property extraction unchanged for the default 'property' source (하위호환)", () => {
    // descriptionSource 부재 + 주입 map 있어도 property 소스는 map을 쓰지 않는다.
    const pages = [
      page('pg1', {
        Name: { title: [{ plain_text: 'x' }] },
        When: { date: { start: '2026-07-13' } },
        Notes: { type: 'rich_text', rich_text: [{ plain_text: 'from property' }] },
      }),
    ]
    const [event] = pagesToEvents(pages, mapping, new Map([['pg1', 'from body']]))
    expect(event.description).toBe('from property')
  })
})
