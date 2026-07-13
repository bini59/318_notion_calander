'use client'

import { useEffect, useMemo, useState } from 'react'
import { autoDetectMapping, type CalendarFilter, type NotionProperty } from '@/lib/mapping'

type Database = { id: string; title: string }
type Calendar = { id: string; feedUrl: string }

const NONE = '' // "없음(-)" 옵션 값 — 선택 매핑 미지정

// 필터(#13) UI 행. property는 이름, type은 property에서 파생. condition/value는 서버 상한과 동일.
// value는 문자열 보관(checkbox는 'true'/'false') → submit에서 CalendarFilter로 변환.
type FilterRow = { property: string; condition: 'equals' | 'does_not_equal'; value: string }
const FILTER_TYPES = ['select', 'status', 'checkbox']

// MVP: 통합에 공유된 DB 하나를 골라 → 필드 매핑 → 구독 캘린더 생성 (PLAN §3, 이슈 #5).
// feed URL은 문자열만 표시 — /feed/{token}.ics 라우트 실체는 #6.
export default function Setup() {
  const [databases, setDatabases] = useState<Database[] | null>(null)
  const [selected, setSelected] = useState<string>('')
  const [feedUrl, setFeedUrl] = useState<string | null>(null)
  const [calendarId, setCalendarId] = useState<string | null>(null)
  const [calendars, setCalendars] = useState<Calendar[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null) // rotate/delete 진행 중인 항목 id
  const [error, setError] = useState<string | null>(null)
  const [needsConnect, setNeedsConnect] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // 매핑 단계 상태 — properties가 로드되면 매핑 폼으로 전환.
  const [properties, setProperties] = useState<NotionProperty[] | null>(null)
  const [loadingProps, setLoadingProps] = useState(false)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState(NONE)
  const [description, setDescription] = useState(NONE)
  const [location, setLocation] = useState(NONE)
  const [filterRows, setFilterRows] = useState<FilterRow[]>([])

  useEffect(() => {
    fetch('/api/databases')
      .then(async (res) => {
        if (res.status === 401) {
          setNeedsConnect(true)
          return
        }
        if (!res.ok) throw new Error('목록을 불러오지 못했습니다')
        const { databases } = (await res.json()) as { databases: Database[] }
        setDatabases(databases)
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  // 기존에 만든 "내 캘린더" 목록 로드 (이슈 #12). DB 목록과 병렬 — 401은 동일하게 재연결 유도.
  useEffect(() => {
    fetch('/api/calendars')
      .then(async (res) => {
        if (res.status === 401) {
          setNeedsConnect(true)
          return
        }
        if (!res.ok) throw new Error('캘린더 목록을 불러오지 못했습니다')
        const { calendars } = (await res.json()) as { calendars: Calendar[] }
        setCalendars(calendars)
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  // ponytail: N+1 회피 — properties는 사용자가 고른 DB 하나만 이 시점에 1회 조회.
  async function loadProperties() {
    if (!selected) return
    setLoadingProps(true)
    setError(null)
    try {
      const res = await fetch(`/api/databases/${selected}`)
      if (res.status === 401) {
        setNeedsConnect(true)
        return
      }
      if (!res.ok) throw new Error('속성을 불러오지 못했습니다')
      const { properties } = (await res.json()) as { properties: NotionProperty[] }
      const auto = autoDetectMapping(properties)
      setStart(auto.start ?? '')
      setEnd(NONE)
      setDescription(NONE)
      setLocation(NONE)
      setFilterRows([])
      setProperties(properties)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoadingProps(false)
    }
  }

  const dateProps = useMemo(
    () => (properties ?? []).filter((p) => p.type === 'date'),
    [properties],
  )
  const titleProp = useMemo(
    () => (properties ? autoDetectMapping(properties).title : undefined),
    [properties],
  )
  // 필터 가능한 속성만(#13 상한). 없으면 필터 섹션 자체를 숨긴다.
  const filterProps = useMemo(
    () => (properties ?? []).filter((p) => FILTER_TYPES.includes(p.type)),
    [properties],
  )
  const typeOfProp = (name: string) => properties?.find((p) => p.name === name)?.type
  // select/status 값 드롭다운(#15)에 쓸 옵션 목록. 없으면 자유텍스트 폴백 → undefined 반환.
  const optionsOfProp = (name: string) => properties?.find((p) => p.name === name)?.options

  // 필터 행 불변 조작 헬퍼.
  const updateRow = (i: number, patch: Partial<FilterRow>) =>
    setFilterRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const addRow = () =>
    setFilterRows((rows) => [...rows, { property: '', condition: 'equals', value: '' }])
  const removeRow = (i: number) => setFilterRows((rows) => rows.filter((_, idx) => idx !== i))

  // FilterRow → CalendarFilter. property 미선택 행은 버린다. checkbox는 value를 boolean으로.
  // 서버가 zod + validateMappingAgainstProperties로 재검증하므로 여기선 최소 조립만.
  function buildFilters(): CalendarFilter[] {
    return filterRows
      // 불완전 행 드롭: select/status는 값 필수(빈 값은 서버 filterSchema value.min(1)에서 거부돼
      // 엉뚱한 전체 mapping 400으로 표면화됨). checkbox는 value가 boolean이라 항상 유효.
      .filter((r) => r.property && (typeOfProp(r.property) === 'checkbox' || r.value))
      .map((r) => {
        const type = typeOfProp(r.property)
        if (type === 'checkbox') {
          return { type: 'checkbox', property: r.property, value: r.value === 'true' }
        }
        return { type: type as 'select' | 'status', property: r.property, condition: r.condition, value: r.value }
      })
  }

  async function submit() {
    if (!titleProp || !start) return
    setSubmitting(true)
    setError(null)
    try {
      const filters = buildFilters()
      const mapping = {
        title: titleProp,
        start,
        ...(end !== NONE ? { end } : {}),
        ...(description !== NONE ? { description } : {}),
        ...(location !== NONE ? { location } : {}),
        ...(filters.length ? { filters } : {}),
      }
      const res = await fetch('/api/calendars', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ databaseId: selected, mapping }),
      })
      if (res.status === 401) {
        setNeedsConnect(true)
        return
      }
      const data = (await res.json()) as { id?: string; feedUrl?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? '캘린더 생성에 실패했습니다')
      setCalendarId(data.id ?? null)
      setFeedUrl(data.feedUrl ?? null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  // 재발급: 기존 URL을 즉시 무효화하므로 확인을 받는다. 성공 시 새 feedUrl로 교체.
  // 두 진입점(생성 직후 화면 / 목록 항목)이 동일 함수를 재사용하도록 id를 인자로 받는다(#12).
  async function rotate(id: string) {
    if (!confirm('기존 URL은 즉시 무효화되고 새 URL이 발급됩니다. 계속할까요?')) return
    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/api/calendars/${id}/rotate`, { method: 'POST' })
      if (res.status === 401) {
        setNeedsConnect(true)
        return
      }
      const data = (await res.json()) as { feedUrl?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? '재발급에 실패했습니다')
      const newUrl = data.feedUrl ?? null
      if (id === calendarId) setFeedUrl(newUrl) // 생성 직후 화면
      // 목록 항목: 해당 캘린더의 feedUrl만 불변 교체.
      setCalendars((prev) =>
        prev ? prev.map((c) => (c.id === id && newUrl ? { ...c, feedUrl: newUrl } : c)) : prev,
      )
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  // 삭제: 구독 URL을 영구 무효화하므로 확인을 받는다. 성공(204) 시 목록에서 불변 제거(#12).
  async function remove(id: string) {
    if (!confirm('이 캘린더를 삭제하면 구독 URL이 영구적으로 무효화됩니다. 삭제할까요?')) return
    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/api/calendars/${id}`, { method: 'DELETE' })
      if (res.status === 401) {
        setNeedsConnect(true)
        return
      }
      if (!res.ok) throw new Error('삭제에 실패했습니다')
      setCalendars((prev) => (prev ? prev.filter((c) => c.id !== id) : prev))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  if (needsConnect) {
    return (
      <main style={{ padding: 32 }}>
        <p>Notion이 연결되지 않았습니다.</p>
        <a href="/api/auth/notion">Notion 연결하기</a>
      </main>
    )
  }

  if (feedUrl) {
    return (
      <main style={{ padding: 32 }}>
        <h1>구독 URL이 생성되었습니다</h1>
        <p>캘린더 앱에 아래 URL을 구독으로 추가하세요 (구독 기능은 곧 활성화됩니다).</p>
        <input aria-label="구독 URL" readOnly value={feedUrl} style={{ width: '100%', maxWidth: 600 }} />
        <p role="alert" style={{ color: 'crimson' }}>
          이 URL을 아는 사람은 인증 없이 일정 전체를 볼 수 있습니다. URL이 유출되었다면 아래에서
          재발급하세요.
        </p>
        {error && <p role="alert" style={{ color: 'crimson' }}>{error}</p>}
        {calendarId && (
          <button onClick={() => rotate(calendarId)} disabled={busyId === calendarId}>
            {busyId === calendarId ? '재발급 중…' : 'URL 재발급(기존 URL 무효화)'}
          </button>
        )}
        <p>
          <a href="/setup">내 캘린더 목록으로</a>
        </p>
      </main>
    )
  }

  // 2단계: 필드 매핑
  if (properties !== null) {
    return (
      <main style={{ padding: 32 }}>
        <h1>필드 매핑</h1>
        {error && <p role="alert" style={{ color: 'crimson' }}>{error}</p>}

        {dateProps.length === 0 ? (
          <p role="alert">
            이 DB에는 날짜(date) 속성이 없어 캘린더로 만들 수 없습니다. Notion에서 날짜 속성을 추가한
            뒤 다시 시도하세요.
          </p>
        ) : !titleProp ? (
          <p role="alert">이 DB에는 제목(title) 속성이 없어 캘린더로 만들 수 없습니다.</p>
        ) : (
          <>
            <p>
              <label>
                제목(SUMMARY): <strong>{titleProp}</strong>
                {/* title은 DB당 1개 → 자동 감지, 변경 불가 */}
              </label>
            </p>

            <p>
              <label>
                시작일(필수):{' '}
                <select value={start} onChange={(e) => setStart(e.target.value)} disabled={dateProps.length === 1}>
                  {dateProps.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </p>

            <p>
              <label>
                종료일(선택, 별도 date 속성):{' '}
                <select value={end} onChange={(e) => setEnd(e.target.value)}>
                  <option value={NONE}>없음(-)</option>
                  {dateProps.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </p>

            <p>
              <label>
                설명(선택):{' '}
                <select value={description} onChange={(e) => setDescription(e.target.value)}>
                  <option value={NONE}>없음(-)</option>
                  {properties.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </p>

            <p>
              <label>
                장소(선택):{' '}
                <select value={location} onChange={(e) => setLocation(e.target.value)}>
                  <option value={NONE}>없음(-)</option>
                  {properties.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </p>

            {filterProps.length > 0 && (
              <fieldset style={{ marginTop: 16 }}>
                <legend>필터(선택) — 조건에 맞는 항목만 노출 (여러 조건은 모두 AND)</legend>
                {filterRows.map((row, i) => {
                  const rowType = typeOfProp(row.property)
                  return (
                    <p key={i}>
                      <select
                        aria-label={`필터 ${i + 1} 속성`}
                        value={row.property}
                        onChange={(e) => {
                          const property = e.target.value
                          const isCheckbox = typeOfProp(property) === 'checkbox'
                          updateRow(i, { property, value: isCheckbox ? 'true' : '' })
                        }}
                      >
                        <option value="">속성 선택</option>
                        {filterProps.map((p) => (
                          <option key={p.name} value={p.name}>
                            {p.name} ({p.type})
                          </option>
                        ))}
                      </select>{' '}
                      {rowType === 'checkbox' ? (
                        <select
                          aria-label={`필터 ${i + 1} 값`}
                          value={row.value}
                          onChange={(e) => updateRow(i, { value: e.target.value })}
                        >
                          <option value="true">체크됨</option>
                          <option value="false">체크 안 됨</option>
                        </select>
                      ) : (
                        <>
                          <select
                            aria-label={`필터 ${i + 1} 조건`}
                            value={row.condition}
                            onChange={(e) =>
                              updateRow(i, { condition: e.target.value as FilterRow['condition'] })
                            }
                          >
                            <option value="equals">=</option>
                            <option value="does_not_equal">≠</option>
                          </select>{' '}
                          {optionsOfProp(row.property)?.length ? (
                            <select
                              aria-label={`필터 ${i + 1} 값`}
                              value={row.value}
                              onChange={(e) => updateRow(i, { value: e.target.value })}
                            >
                              <option value="">값 선택</option>
                              {optionsOfProp(row.property)!.map((o) => (
                                <option key={o.name} value={o.name}>
                                  {o.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              aria-label={`필터 ${i + 1} 값`}
                              value={row.value}
                              placeholder="값 (예: Done)"
                              onChange={(e) => updateRow(i, { value: e.target.value })}
                            />
                          )}
                        </>
                      )}{' '}
                      <button type="button" onClick={() => removeRow(i)}>
                        삭제
                      </button>
                    </p>
                  )
                })}
                <button type="button" onClick={addRow}>
                  필터 추가
                </button>
              </fieldset>
            )}

            <button onClick={submit} disabled={!start || submitting}>
              {submitting ? '생성 중…' : '캘린더 만들기'}
            </button>
          </>
        )}

        <p>
          <button onClick={() => setProperties(null)} disabled={submitting}>
            뒤로
          </button>
        </p>
      </main>
    )
  }

  // 1단계: 내 캘린더 목록 + 새 캘린더용 DB 선택
  return (
    <main style={{ padding: 32 }}>
      <section>
        <h1>내 캘린더</h1>
        {calendars === null && !error && <p>불러오는 중…</p>}
        {calendars !== null && calendars.length === 0 && (
          <p>아직 만든 캘린더가 없습니다. 아래에서 새로 만들 수 있습니다.</p>
        )}
        {calendars !== null && calendars.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {calendars.map((cal) => (
              <li key={cal.id} style={{ marginBottom: 16 }}>
                <input aria-label="구독 URL" readOnly value={cal.feedUrl} style={{ width: '100%', maxWidth: 600 }} />
                <div>
                  <button onClick={() => rotate(cal.id)} disabled={busyId === cal.id}>
                    {busyId === cal.id ? '처리 중…' : 'URL 재발급'}
                  </button>{' '}
                  <button onClick={() => remove(cal.id)} disabled={busyId === cal.id}>
                    삭제
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <h1>캘린더로 만들 Notion DB 선택</h1>
      {error && <p role="alert" style={{ color: 'crimson' }}>{error}</p>}
      {databases === null && !error && <p>불러오는 중…</p>}
      {databases !== null && databases.length === 0 && (
        <p>공유된 DB가 없습니다. Notion에서 통합에 DB를 공유한 뒤 새로고침하세요.</p>
      )}
      {databases !== null && databases.length > 0 && (
        <>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {databases.map((db) => (
              <li key={db.id}>
                <label>
                  <input
                    type="radio"
                    name="database"
                    value={db.id}
                    checked={selected === db.id}
                    onChange={() => setSelected(db.id)}
                  />{' '}
                  {db.title || '(제목 없음)'}
                </label>
              </li>
            ))}
          </ul>
          <button onClick={loadProperties} disabled={!selected || loadingProps}>
            {loadingProps ? '불러오는 중…' : '다음'}
          </button>
        </>
      )}
    </main>
  )
}
