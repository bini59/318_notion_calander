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

  it('throws with status only (no body leak) on non-2xx', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({}) })
    await expect(notion.getDatabaseProperties('tok', 'db1')).rejects.toThrow('403')
  })
})
