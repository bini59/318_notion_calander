'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AppShell, Button, ThemeToggle } from '@bini59/design'
import { CalendarDays } from 'lucide-react'
import { LOGO_MARK_URL } from '@/lib/logo'

type State = { state: string; version: number; cleanupPending: boolean; accountUrl: string; rejoinRecovery: boolean }
export default function Account() {
  const router = useRouter()
  const [state, setState] = useState<State | null>(null)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const pending = useRef(false)
  const loadingRef = useRef(false)
  async function load() {
    if (loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    try {
      const res = await fetch('/api/membership')
      if (!res.ok) throw new Error(res.status === 401 ? '로그인 또는 서비스 인증을 확인할 수 없습니다. 홈에서 다시 로그인한 뒤에도 문제가 계속되면 잠시 후 다시 시도해 주세요.' : '가입 상태를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.')
      setState(await res.json())
      setError('')
    } catch (e) { setState(null); setError((e as Error).message) }
    finally { loadingRef.current = false; setLoading(false) }
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
    setActionError('')
    try {
      const token = document.cookie.split('; ').find(v => v.startsWith('csrf='))?.slice(5) ?? ''
      const res = await fetch('/api/membership', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': decodeURIComponent(token) }, body: JSON.stringify({ action, version: state.version, consent: true }) })
      if (!res.ok) throw new Error('Membership action failed')
      router.replace(action === 'rejoin' ? '/setup' : '/')
    } catch {
      setActionError('요청을 완료하지 못했습니다. 다시 확인한 가입 상태를 확인해 주세요.')
      setConfirmed(false)
      // A failed response does not prove that the remote transition failed.
      // Discard the old version and reconcile before offering another action.
      setState(null)
      await load()
    } finally { pending.current = false; setBusy(false) }
  }
  const withdrawn = state?.state === 'withdrawn'
  const rejoin = !!state && ((withdrawn && !state.cleanupPending) || state.rejoinRecovery)
  return <AppShell
    brand={{ mark: <img alt="" className="size-full object-cover" src={LOGO_MARK_URL} />, name: 'Notion Calendar', host: 'n2c.bini59.dev', href: '/' }}
    nav={[{ id: 'calendars', label: '내 캘린더', icon: <CalendarDays className="size-4" />, href: '/setup' }]}
    activeId="account"
    sidebarFoot={<ThemeToggle />}
    crumb={<strong>계정</strong>}
  >
    <section className="mx-auto w-full max-w-[640px] space-y-6 px-6 py-10">
      <div className="space-y-2"><p className="text-sm text-muted-foreground">계정</p><h1 className="text-2xl font-semibold">{rejoin ? '캘린더 서비스 재가입' : '캘린더 서비스 탈퇴'}</h1></div>
      {loading && <p role="status" className="text-muted-foreground">가입 상태를 확인하고 있습니다…</p>}
      {actionError && <div role="alert" className="rounded-lg border border-destructive/40 p-5 text-destructive">{actionError}</div>}
      {error && <div role="alert" className="space-y-4 rounded-lg border border-destructive/40 p-5"><p className="text-destructive">{error}</p><div className="flex flex-wrap items-center gap-4"><Button disabled={loading || busy} onClick={() => void load()}>상태 다시 확인</Button><Link className="text-sm underline" href="/">홈으로 이동</Link></div></div>}
      {state && !loading && !error && <div className="space-y-6">
        {rejoin ? <div className="space-y-2"><p>캘린더 서비스를 다시 이용하려면 재가입에 동의하고 Notion을 새로 연결해 주세요.</p><p>로그인만으로는 재가입되지 않습니다.</p></div> : <div className="space-y-2"><p>서비스 탈퇴 시 Notion 연결 정보와 캘린더 설정이 삭제되며, 기존 구독 URL은 사용할 수 없습니다. 삭제한 설정은 복구할 수 없습니다.</p><p>Notion 원본 데이터, 공통 계정과 다른 서비스 가입 상태는 유지됩니다.</p>{withdrawn && <p>탈퇴한 상태입니다. 아직 완료되지 않은 데이터 정리를 재시도해 주세요.</p>}</div>}
        <label className="flex items-start gap-3 rounded-lg border p-4"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)}/><span>{rejoin ? '캘린더 서비스 재가입에 동의합니다.' : '삭제 범위를 확인했으며 캘린더 서비스 탈퇴에 동의합니다.'}</span></label>
        <div className="flex flex-wrap gap-3"><Button disabled={busy || !confirmed} onClick={() => void submit(rejoin ? 'rejoin' : withdrawn ? 'cleanup' : 'withdraw')}>{busy ? '처리 중…' : rejoin ? '동의하고 재가입' : withdrawn ? '데이터 정리 재시도' : '최종 확인: 캘린더 서비스 탈퇴'}</Button><Button disabled={busy} onClick={() => router.push(withdrawn ? '/' : '/setup')}>취소</Button></div>
        <div className="space-y-2 border-t pt-6"><p>다른 서비스에서도 탈퇴하려면 <a className="underline" href={state.accountUrl}>전체 계정 관리로 이동하세요</a>.</p><p className="text-sm text-muted-foreground">전체 계정 탈퇴는 공통 계정과 연결된 로그인 수단, 모든 서비스 가입 상태를 삭제하고 모든 로그인 세션을 종료합니다. 각 서비스의 로컬 데이터는 삭제 동기화 시 정리됩니다. Notion 원본은 유지됩니다.</p></div>
      </div>}
      <Link className="inline-block text-sm underline" href="/setup">내 캘린더로 돌아가기</Link>
    </section>
  </AppShell>
}
