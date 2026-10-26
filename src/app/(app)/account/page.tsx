'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@bini59/design'

type State = { state: string; version: number; cleanupPending: boolean; accountUrl: string; rejoinRecovery: boolean }
export default function Account() {
  const router = useRouter()
  const [state, setState] = useState<State | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const pending = useRef(false)
  async function load() {
    try {
      const res = await fetch('/api/membership')
      if (!res.ok) throw new Error(res.status === 401 ? '로그인이 필요합니다. 랜딩에서 로그인한 뒤 다시 방문해 주세요.' : '가입 상태를 불러오지 못했습니다.')
      setState(await res.json())
    } catch (e) { setError((e as Error).message) }
  }
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0)
    return () => clearTimeout(timer)
  }, [])
  async function submit(action: string) {
    if (pending.current || !state || !confirmed) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      const token = document.cookie.split('; ').find(v => v.startsWith('csrf='))?.slice(5) ?? ''
      const res = await fetch('/api/membership', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': decodeURIComponent(token) }, body: JSON.stringify({ action, version: state.version, consent: true }) })
      if (!res.ok) { const data = await res.json(); throw new Error(data.error) }
      router.replace(action === 'rejoin' ? '/setup' : '/')
    } catch (e) {
      setError((e as Error).message)
      setConfirmed(false)
      await load()
    } finally { pending.current = false; setBusy(false) }
  }
  const withdrawn = state?.state === 'withdrawn'
  const rejoin = !!state && ((withdrawn && !state.cleanupPending) || state.rejoinRecovery)
  return <main className="mx-auto max-w-xl space-y-6 px-6 py-12">
    <h1 className="text-2xl font-semibold">{rejoin ? '캘린더 서비스 재가입' : '캘린더 서비스 탈퇴'}</h1>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {!state && <Button onClick={() => { setError(''); void load() }}>상태 다시 확인</Button>}
    {state && <>
      <p>서비스 탈퇴 시 Notion 연결 정보와 캘린더 설정이 삭제되며, 기존 구독 URL은 사용할 수 없습니다. 삭제한 설정은 복구할 수 없습니다.</p>
      <p>Notion 원본 데이터, 공통 계정과 다른 서비스 가입 상태는 유지됩니다.</p>
      {withdrawn && <p>{rejoin ? '탈퇴가 완료되었습니다. 로그인만으로 재가입되지 않습니다. 다시 이용하려면 명시적으로 재가입에 동의하고 Notion을 새로 연결해 주세요.' : '탈퇴한 상태입니다. 아직 완료되지 않은 데이터 정리를 재시도해 주세요.'}</p>}
      <label className="flex gap-2"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)}/>{rejoin ? '캘린더 서비스 재가입에 동의합니다.' : '삭제 범위를 확인했으며 캘린더 서비스 탈퇴에 동의합니다.'}</label>
      <div className="flex gap-3"><Button disabled={busy} onClick={() => router.push(withdrawn ? '/' : '/setup')}>취소</Button><Button disabled={busy || !confirmed} onClick={() => void submit(rejoin ? 'rejoin' : withdrawn ? 'cleanup' : 'withdraw')}>{busy ? '처리 중…' : rejoin ? '동의하고 재가입' : withdrawn ? '데이터 정리 재시도' : '최종 확인: 캘린더 서비스 탈퇴'}</Button></div>
      <p>다른 서비스에서도 탈퇴하려면 <a className="underline" href={state.accountUrl}>전체 계정 관리로 이동하세요</a>.</p>
      <p className="text-sm text-muted-foreground">전체 계정 탈퇴는 공통 계정과 연결된 로그인 수단, 모든 서비스 가입 상태를 삭제하고 모든 로그인 세션을 종료합니다. 각 서비스의 로컬 데이터는 삭제 동기화 시 정리됩니다. Notion 원본은 유지됩니다.</p>
    </>}
    <Link className="underline" href="/">랜딩으로 이동</Link>
  </main>
}
