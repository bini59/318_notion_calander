import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

let notion: typeof import('./notion')

beforeAll(async () => {
  notion = await import('./notion')
})

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body }
}

describe('searchDatabases pagination', () => {
  it('merges results across two pages until has_more is false', async () => {
    fetchMock
      .mockResolvedValueOnce(
        ok({
          results: [{ id: 'db1', title: [{ plain_text: 'Sprint ' }, { plain_text: 'Board' }] }],
          has_more: true,
          next_cursor: 'cursor-2',
        }),
      )
      .mockResolvedValueOnce(
        ok({
          results: [{ id: 'db2', title: [{ plain_text: 'Roadmap' }] }],
          has_more: false,
          next_cursor: null,
        }),
      )

    const dbs = await notion.searchDatabases('tok')

    expect(dbs).toEqual([
      { id: 'db1', title: 'Sprint Board' },
      { id: 'db2', title: 'Roadmap' },
    ])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // 2번째 호출은 첫 응답의 next_cursor를 start_cursor로 전달해야 한다.
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(secondBody.start_cursor).toBe('cursor-2')
  })

  it('handles untitled / empty-title databases without crashing', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({
        results: [{ id: 'db1', title: [] }, { id: 'db2' }],
        has_more: false,
        next_cursor: null,
      }),
    )

    const dbs = await notion.searchDatabases('tok')
    expect(dbs).toEqual([
      { id: 'db1', title: '' },
      { id: 'db2', title: '' },
    ])
  })

  it('throws with status only (no body leak) on non-2xx', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) })
    await expect(notion.searchDatabases('tok')).rejects.toThrow('429')
  })
})

describe('queryDatabase pagination', () => {
  const pageStub = (id: string) => ({ id, url: `https://notion.so/${id}`, properties: {} })

  it('merges results across pages until has_more is false (100 + 30 = 130)', async () => {
    const first = Array.from({ length: 100 }, (_, i) => pageStub(`p${i}`))
    const second = Array.from({ length: 30 }, (_, i) => pageStub(`q${i}`))
    fetchMock
      .mockResolvedValueOnce(ok({ results: first, has_more: true, next_cursor: 'cursor-2' }))
      .mockResolvedValueOnce(ok({ results: second, has_more: false, next_cursor: null }))

    const pages = await notion.queryDatabase('tok', 'db1')

    expect(pages).toHaveLength(130)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // 첫 호출엔 start_cursor 없음, 2번째 호출은 첫 응답의 next_cursor를 실어야 한다.
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).start_cursor).toBeUndefined()
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).start_cursor).toBe('cursor-2')
    // POST /databases/{id}/query (search와 다른 엔드포인트).
    expect(fetchMock.mock.calls[0][0]).toContain('/databases/db1/query')
  })

  it('throws with status only (no body leak) on non-2xx', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) })
    await expect(notion.queryDatabase('tok', 'db1')).rejects.toThrow('429')
  })

  it('omits the filter key from the body when no filter is passed', async () => {
    fetchMock.mockResolvedValueOnce(ok({ results: [], has_more: false, next_cursor: null }))
    await notion.queryDatabase('tok', 'db1')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty('filter')
  })

  it('forwards the built filter body (Status does_not_equal Done — 완료조건)', async () => {
    const filter = notion.buildNotionFilter([
      { type: 'status', property: 'Status', condition: 'does_not_equal', value: 'Done' },
    ])
    fetchMock.mockResolvedValueOnce(ok({ results: [], has_more: false, next_cursor: null }))
    await notion.queryDatabase('tok', 'db1', filter)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).filter).toEqual({
      and: [{ property: 'Status', status: { does_not_equal: 'Done' } }],
    })
  })

  it('keeps the filter on every page while paginating (filter + start_cursor together)', async () => {
    const filter = notion.buildNotionFilter([{ type: 'checkbox', property: 'Done', value: true }])
    fetchMock
      .mockResolvedValueOnce(ok({ results: [], has_more: true, next_cursor: 'cursor-2' }))
      .mockResolvedValueOnce(ok({ results: [], has_more: false, next_cursor: null }))
    await notion.queryDatabase('tok', 'db1', filter)
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(secondBody.start_cursor).toBe('cursor-2')
    expect(secondBody.filter).toEqual({ and: [{ property: 'Done', checkbox: { equals: true } }] })
  })
})

describe('buildNotionFilter', () => {
  it('returns undefined for no/empty filters (no empty {and:[]} to Notion)', () => {
    expect(notion.buildNotionFilter()).toBeUndefined()
    expect(notion.buildNotionFilter([])).toBeUndefined()
  })

  it('wraps multiple filters in an AND with per-type Notion shapes', () => {
    expect(
      notion.buildNotionFilter([
        { type: 'select', property: 'Place', condition: 'equals', value: 'HQ' },
        { type: 'status', property: 'Status', condition: 'does_not_equal', value: 'Done' },
        { type: 'checkbox', property: 'Done', value: false },
      ]),
    ).toEqual({
      and: [
        { property: 'Place', select: { equals: 'HQ' } },
        { property: 'Status', status: { does_not_equal: 'Done' } },
        { property: 'Done', checkbox: { equals: false } },
      ],
    })
  })
})

describe('getDatabaseProperties', () => {
  it('flattens the Notion properties object into a (name, type) list', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ properties: { Name: { type: 'title' }, When: { type: 'date' }, Notes: { type: 'rich_text' } } }),
    )
    expect(await notion.getDatabaseProperties('tok', 'db1')).toEqual([
      { name: 'Name', type: 'title' },
      { name: 'When', type: 'date' },
      { name: 'Notes', type: 'rich_text' },
    ])
  })

  it('returns an empty list when the DB has no date property (0-date case)', async () => {
    fetchMock.mockResolvedValueOnce(ok({ properties: { Tags: { type: 'multi_select' } } }))
    const props = await notion.getDatabaseProperties('tok', 'db1')
    expect(props.some((p) => p.type === 'date')).toBe(false)
  })

  it('parses select/status/multi_select options as {name}[]; status ignores groups', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({
        properties: {
          Place: { type: 'select', select: { options: [{ id: '1', name: 'HQ', color: 'red' }, { id: '2', name: 'Home' }] } },
          Status: {
            type: 'status',
            status: {
              options: [{ id: 's1', name: 'Todo' }, { id: 's2', name: 'Done' }],
              groups: [{ id: 'g1', name: 'In progress', option_ids: ['s1'] }],
            },
          },
          Tags: { type: 'multi_select', multi_select: { options: [{ id: 't1', name: 'urgent' }] } },
        },
      }),
    )
    const props = await notion.getDatabaseProperties('tok', 'db1')
    expect(props).toEqual([
      { name: 'Place', type: 'select', options: [{ name: 'HQ' }, { name: 'Home' }] },
      { name: 'Status', type: 'status', options: [{ name: 'Todo' }, { name: 'Done' }] },
      { name: 'Tags', type: 'multi_select', options: [{ name: 'urgent' }] },
    ])
  })

  it('leaves options undefined for non-option types (date/title/rich_text)', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ properties: { When: { type: 'date' }, Name: { type: 'title' }, Notes: { type: 'rich_text' } } }),
    )
    const props = await notion.getDatabaseProperties('tok', 'db1')
    expect(props.every((p) => p.options === undefined)).toBe(true)
  })

  it('throws with status only (no body leak) on non-2xx', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({}) })
    await expect(notion.getDatabaseProperties('tok', 'db1')).rejects.toThrow('403')
  })
})
