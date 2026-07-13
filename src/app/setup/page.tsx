'use client'

import { useEffect, useMemo, useState } from 'react'
import { autoDetectMapping, type NotionProperty } from '@/lib/mapping'

type Database = { id: string; title: string }

const NONE = '' // "없음(-)" 옵션 값 — 선택 매핑 미지정

// MVP: 통합에 공유된 DB 하나를 골라 → 필드 매핑 → 구독 캘린더 생성 (PLAN §3, 이슈 #5).
// feed URL은 문자열만 표시 — /feed/{token}.ics 라우트 실체는 #6.
export default function Setup() {
  const [databases, setDatabases] = useState<Database[] | null>(null)
  const [selected, setSelected] = useState<string>('')
  const [feedUrl, setFeedUrl] = useState<string | null>(null)
  const [calendarId, setCalendarId] = useState<string | null>(null)
  const [rotating, setRotating] = useState(false)
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

  async function submit() {
    if (!titleProp || !start) return
    setSubmitting(true)
    setError(null)
    try {
      const mapping = {
        title: titleProp,
        start,
        ...(end !== NONE ? { end } : {}),
        ...(description !== NONE ? { description } : {}),
        ...(location !== NONE ? { location } : {}),
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
  async function rotate() {
    if (!calendarId) return
    if (!confirm('기존 URL은 즉시 무효화되고 새 URL이 발급됩니다. 계속할까요?')) return
    setRotating(true)
    setError(null)
    try {
      const res = await fetch(`/api/calendars/${calendarId}/rotate`, { method: 'POST' })
      if (res.status === 401) {
        setNeedsConnect(true)
        return
      }
      const data = (await res.json()) as { feedUrl?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? '재발급에 실패했습니다')
      setFeedUrl(data.feedUrl ?? null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRotating(false)
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
        <input readOnly value={feedUrl} style={{ width: '100%', maxWidth: 600 }} />
        <p role="alert" style={{ color: 'crimson' }}>
          이 URL을 아는 사람은 인증 없이 일정 전체를 볼 수 있습니다. URL이 유출되었다면 아래에서
          재발급하세요.
        </p>
        {error && <p role="alert" style={{ color: 'crimson' }}>{error}</p>}
        {calendarId && (
          <button onClick={rotate} disabled={rotating}>
            {rotating ? '재발급 중…' : 'URL 재발급(기존 URL 무효화)'}
          </button>
        )}
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

  // 1단계: DB 선택
  return (
    <main style={{ padding: 32 }}>
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
