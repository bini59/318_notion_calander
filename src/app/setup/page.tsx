'use client'

import { useEffect, useState } from 'react'

type Database = { id: string; title: string }

// MVP: 통합에 공유된 DB 하나를 골라 구독 캘린더를 만든다 (PLAN §3).
// feed URL은 문자열만 표시 — /feed/{token}.ics 라우트 실체는 #5.
export default function Setup() {
  const [databases, setDatabases] = useState<Database[] | null>(null)
  const [selected, setSelected] = useState<string>('')
  const [feedUrl, setFeedUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [needsConnect, setNeedsConnect] = useState(false)
  const [submitting, setSubmitting] = useState(false)

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

  async function submit() {
    if (!selected) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/calendars', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ databaseId: selected }),
      })
      const data = (await res.json()) as { feedUrl?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? '캘린더 생성에 실패했습니다')
      setFeedUrl(data.feedUrl ?? null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
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
      </main>
    )
  }

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
          <button onClick={submit} disabled={!selected || submitting}>
            {submitting ? '생성 중…' : '캘린더 만들기'}
          </button>
        </>
      )}
    </main>
  )
}
