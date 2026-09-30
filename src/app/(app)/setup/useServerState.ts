'use client'

// 서버 상태 전담(TanStack Query). 폼 입력·위저드 단계·복사 표시 같은 클라이언트 상태는 page.tsx가 소유하고,
// 여기선 조회 캐시 + 변경 후 캐시 갱신만 한다. 반환 형태는 page.tsx가 그대로 쓰도록 유지.

import { useState } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AuthenticatedUser } from '@bini59/design'
import type { CalendarMapping, NotionProperty } from '@/lib/mapping'

export type Database = { id: string; title: string }
export type Calendar = { id: string; name: string; feedUrl: string; databaseId: string; mapping: CalendarMapping }
// relation(#16) 값 드롭다운 원본: property 이름별 로딩/에러/결과.
export type RelationState = { loading?: boolean; error?: string; options?: { id: string; title: string }[] }

class Unauthorized extends Error {}

// fetch 래퍼: 401 → Unauthorized, 비정상 응답 → Error. 변경 요청(init 있음)만 서버가 준 error 메시지를 노출한다.
async function call<T>(url: string, fallback: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (res.status === 401) throw new Unauthorized()
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error((init && data.error) || fallback)
  return data
}
const json = (body: unknown, method = 'POST'): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

const fetchProperties = (id: string) =>
  call<{ properties: NotionProperty[] }>(`/api/databases/${id}`, '속성을 불러오지 못했습니다').then((d) => d.properties)

export function useServerState() {
  const qc = useQueryClient()
  const [actionError, setError] = useState<string | null>(null)
  const [unauthorized, setUnauthorized] = useState(false)
  // 사용자가 "다음"으로 확정한 DB — 값이 있으면 매핑 단계. properties/relation 옵션 쿼리의 키.
  const [activeDb, setActiveDb] = useState<string | null>(null)
  const [relNames, setRelNames] = useState<string[]>([])

  const dbQ = useQuery({
    queryKey: ['databases'],
    queryFn: () => call<{ databases: Database[] }>('/api/databases', '목록을 불러오지 못했습니다').then((d) => d.databases),
  })
  const calQ = useQuery({
    queryKey: ['calendars'],
    queryFn: () => call<{ calendars: Calendar[] }>('/api/calendars', '캘린더 목록을 불러오지 못했습니다').then((d) => d.calendars),
  })
  // staleTime Infinity: 마운트/포커스 재조회 없이, 갱신은 loadProperties의 명시적 fetchQuery로만.
  const propsQ = useQuery({
    queryKey: ['properties', activeDb],
    queryFn: () => fetchProperties(activeDb!),
    enabled: !!activeDb,
    staleTime: Infinity,
  })
  // relation 옵션은 property별 1회만 로딩. 신뢰경계: 클라는 (선택 DB, property)만 보내고 서버가 관련 DB id를 재도출한다.
  const relQs = useQueries({
    queries: relNames.map((name) => ({
      queryKey: ['relation-options', activeDb, name],
      queryFn: () =>
        call<{ options: { id: string; title: string }[] }>(
          `/api/databases/${activeDb}/relation-options?property=${encodeURIComponent(name)}`,
          '관련 페이지 목록을 불러오지 못했습니다',
        ),
      enabled: !!activeDb,
      staleTime: Infinity,
    })),
  })
  const relationState: Record<string, RelationState> = Object.fromEntries(
    relNames.map((n, i) => [n, { loading: relQs[i].isLoading, error: relQs[i].error?.message, options: relQs[i].data?.options }]),
  )

  // 401은 재연결 유도(needsConnect), 그 외 오류는 error로 노출. 액션 오류가 조회 오류보다 우선.
  const queryErrors = [dbQ.error, calQ.error]
  const needsConnect = unauthorized || queryErrors.some((e) => e instanceof Unauthorized)
  const error = actionError ?? queryErrors.find((e) => e && !(e instanceof Unauthorized))?.message ?? null

  // 변경/명령형 요청의 공통 처리: 에러 초기화 → 실행 → 401은 재연결 유도, 그 외는 error에 기록. 실패 시 undefined.
  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setError(null)
    try {
      return await fn()
    } catch (e) {
      if (e instanceof Unauthorized) setUnauthorized(true)
      else setError((e as Error).message)
    }
  }

  const loadDatabases = () => {
    setError(null)
    return qc.resetQueries({ queryKey: ['databases'] }) // 데이터를 비우고 재조회 → 목록 스켈레톤
  }
  const loadCalendars = () => {
    setError(null)
    return calQ.refetch()
  }

  // ponytail: N+1 회피 — properties는 사용자가 고른 DB 하나만 이 시점에 1회 조회(staleTime 0: 항상 새로). 실패 시 undefined.
  const loadProperties = (databaseId: string) =>
    run(async () => {
      const properties = await qc.fetchQuery({ queryKey: ['properties', databaseId], queryFn: () => fetchProperties(databaseId), staleTime: 0 })
      qc.removeQueries({ queryKey: ['relation-options'] })
      setRelNames([])
      setActiveDb(databaseId)
      return properties
    })
  const clearProperties = () => {
    setActiveDb(null)
    setRelNames([])
  }
  const loadRelationOptions = (name: string) => setRelNames((l) => (l.includes(name) ? l : [...l, name]))

  // 변경 요청: 성공 시 calendars 캐시만 갱신(create만 목록 재조회).
  const setCalendars = (fn: (l: Calendar[]) => Calendar[]) => qc.setQueryData<Calendar[]>(['calendars'], (l) => l && fn(l))
  const patch = (id: string, p: Partial<Calendar>) => setCalendars((l) => l.map((c) => (c.id === id ? { ...c, ...p } : c)))

  const create = useMutation({
    mutationFn: (body: { databaseId: string; mapping: unknown; name: string }) =>
      call<{ feedUrl?: string }>('/api/calendars', '캘린더 생성에 실패했습니다', json(body)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendars'] }),
  })
  const rotate = useMutation({
    mutationFn: (id: string) => call<{ feedUrl?: string }>(`/api/calendars/${id}/rotate`, '재발급에 실패했습니다', { method: 'POST' }),
    onSuccess: ({ feedUrl }, id) => {
      if (feedUrl) patch(id, { feedUrl })
    },
  })
  const del = useMutation({
    mutationFn: (id: string) => call(`/api/calendars/${id}`, '삭제에 실패했습니다', { method: 'DELETE' }),
    onSuccess: (_, id) => setCalendars((l) => l.filter((c) => c.id !== id)),
  })
  // 서버가 trim/폴백한 최종 이름으로 교체.
  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      call<{ name?: string }>(`/api/calendars/${id}`, '이름 변경에 실패했습니다', json({ name }, 'PATCH')),
    onSuccess: (d, { id }) => {
      if (d.name) patch(id, { name: d.name })
    },
  })

  // 생성 성공 시 feedUrl(없으면 null), 실패 시 undefined.
  const createCalendar = (body: { databaseId: string; mapping: unknown; name: string }) =>
    run(async () => (await create.mutateAsync(body)).feedUrl ?? null)
  const rotateCalendar = (id: string) => run(() => rotate.mutateAsync(id))
  const deleteCalendar = (id: string) => run(() => del.mutateAsync(id))
  // 성공 여부를 반환(드래프트 정리용).
  const renameCalendar = async (id: string, name: string) =>
    !!(await run(async () => {
      await rename.mutateAsync({ id, name })
      return true
    }))

  return {
    databases: dbQ.data ?? null,
    calendars: calQ.data ?? null,
    calendarsLoading: calQ.isLoading,
    properties: activeDb ? (propsQ.data ?? null) : null,
    relationState, needsConnect, error,
    setError, clearProperties,
    loadDatabases, loadCalendars, loadProperties, loadRelationOptions,
    createCalendar, rotateCalendar, deleteCalendar, renameCalendar,
  }
}

// 로그인 사용자(/api/me). 실패는 조용히 null.
export function useUser() {
  const { data } = useQuery({
    queryKey: ['me'],
    queryFn: async (): Promise<AuthenticatedUser | null> => {
      try {
        const res = await fetch('/api/me')
        return res.ok ? ((await res.json()) as AuthenticatedUser) : null
      } catch {
        return null
      }
    },
  })
  return data ?? null
}
