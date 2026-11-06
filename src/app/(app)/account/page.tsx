'use client'

import { Footer } from '@/components/Footer'
import { useTranslations } from '@/lib/i18n-client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@bini59/design'

type State = { state: string; version: number; cleanupPending: boolean; accountUrl: string; rejoinRecovery: boolean }
export default function Account() {
  const t = useTranslations()
  const router = useRouter()
  const [state, setState] = useState<State | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const pending = useRef(false)
  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/membership')
      if (!res.ok) throw new Error(res.status === 401 ? t('pleaseSignInOnTheHome') : t('couldNotLoadYourMembershipStatus'))
      setState(await res.json())
    } catch (e) { setError(e instanceof TypeError ? t('couldNotLoadYourMembershipStatus') : (e as Error).message) }
  }, [t])
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0)
    return () => clearTimeout(timer)
  }, [load])
  async function submit(action: string) {
    if (pending.current || !state || !confirmed) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      const token = document.cookie.split('; ').find(v => v.startsWith('csrf='))?.slice(5) ?? ''
      const res = await fetch('/api/membership', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': decodeURIComponent(token) }, body: JSON.stringify({ action, version: state.version, consent: true }) })
      if (!res.ok) { throw new Error(t('membershipError')) }
      router.replace(action === 'rejoin' ? '/setup' : '/')
    } catch (e) {
      setError(e instanceof TypeError ? t('membershipError') : (e as Error).message)
      setConfirmed(false)
      await load()
    } finally { pending.current = false; setBusy(false) }
  }
  const withdrawn = state?.state === 'withdrawn'
  const rejoin = !!state && ((withdrawn && !state.cleanupPending) || state.rejoinRecovery)
  return <main className="mx-auto max-w-xl space-y-6 px-6 py-12">
    <h1 className="text-2xl font-semibold">{rejoin ? t('rejoinTheCalendarService') : t('leaveTheCalendarService')}</h1>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {!state && <Button onClick={() => { setError(''); void load() }}>{t('checkStatusAgain')}</Button>}
    {state && <>
      <p>{t('leavingTheServiceDeletesYourNotion')}</p>
      <p>{t('yourOriginalNotionDataSharedAccount')}</p>
      {withdrawn && <p>{rejoin ? t('youHaveLeftTheServiceSigning') : t('youHaveLeftTheServicePlease')}</p>}
      <label className="flex gap-2"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)}/>{rejoin ? t('iAgreeToRejoinTheCalendar') : t('iUnderstandWhatWillBeDeleted')}</label>
      <div className="flex flex-wrap gap-3"><Button disabled={busy} onClick={() => router.push(withdrawn ? '/' : '/setup')}>{t('cancel')}</Button><Button disabled={busy || !confirmed} onClick={() => void submit(rejoin ? 'rejoin' : withdrawn ? 'cleanup' : 'withdraw')}>{busy ? t('processing') : rejoin ? t('agreeAndRejoin') : withdrawn ? t('retryDataCleanup') : t('confirmLeaveTheCalendarService')}</Button></div>
      <p>{t('toLeaveOtherServicesAsWell')} <a className="underline" href={state.accountUrl}>{t('goToAccountManagement')}</a>.</p>
      <p className="text-sm text-muted-foreground">{t('deletingYourEntireAccountRemovesThe')}</p>
    </>}
    <Link className="underline" href="/">{t('goToHomePage')}</Link>
    <Footer />
  </main>
}
