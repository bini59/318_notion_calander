// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import Account from './page'

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }))
vi.mock('@bini59/design', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Button: (props: ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props} />,
  ThemeToggle: () => null,
}))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const membership = (state: string, cleanupPending = false) => ({ state, version: 1, cleanupPending, accountUrl: 'https://example.com', rejoinRecovery: false })
const ok = (value: object) => ({ ok: true, json: async () => value })

it.each([
  ['withdrawn', true, '데이터 정리 재시도'],
  ['withdrawn', false, '동의하고 재가입'],
])('reconciles an uncertain POST to %s (cleanup pending: %s)', async (state, pending, button) => {
  const fetchMock = vi.fn().mockResolvedValueOnce(ok(membership('active')))
    .mockResolvedValueOnce({ ok: false, status: 409 })
    .mockResolvedValueOnce(ok(membership(state, pending)))
  vi.stubGlobal('fetch', fetchMock)
  render(<Account />)
  fireEvent.click(await screen.findByRole('checkbox'))
  fireEvent.click(screen.getByRole('button', { name: '최종 확인: 캘린더 서비스 탈퇴' }))
  expect((await screen.findByRole('button', { name: button })).hasAttribute('disabled')).toBe(true)
  expect(fetchMock).toHaveBeenCalledTimes(3)
  expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false)
})

it('hides stale actions when reconciliation fails and permits a retry', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(ok(membership('active')))
    .mockRejectedValueOnce(new Error('network'))
    .mockResolvedValueOnce({ ok: false, status: 503 })
    .mockResolvedValueOnce(ok(membership('withdrawn', true)))
  vi.stubGlobal('fetch', fetchMock)
  render(<Account />)
  fireEvent.click(await screen.findByRole('checkbox'))
  fireEvent.click(screen.getByRole('button', { name: '최종 확인: 캘린더 서비스 탈퇴' }))
  const retry = await screen.findByRole('button', { name: '상태 다시 확인' })
  await waitFor(() => expect(retry.hasAttribute('disabled')).toBe(false))
  expect(screen.queryByRole('checkbox')).toBeNull()
  fireEvent.click(retry)
  expect(await screen.findByRole('button', { name: '데이터 정리 재시도' })).toBeDefined()
  expect(screen.getByRole('alert').textContent).toContain('요청을 완료하지 못했습니다')
})

it.each([403, 429, 500])('keeps the failed request notice when a %s response reconciles to active', async status => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(ok(membership('active')))
    .mockResolvedValueOnce({ ok: false, status })
    .mockResolvedValueOnce(ok(membership('active'))))
  render(<Account />)
  fireEvent.click(await screen.findByRole('checkbox'))
  fireEvent.click(screen.getByRole('button', { name: '최종 확인: 캘린더 서비스 탈퇴' }))
  expect((await screen.findByRole('alert')).textContent).toContain('요청을 완료하지 못했습니다')
  await waitFor(() => expect(screen.getByRole('button', { name: '최종 확인: 캘린더 서비스 탈퇴' })).toBeDefined())
  expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false)
})
