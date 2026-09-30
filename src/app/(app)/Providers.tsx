'use client'

import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// 401은 재시도해도 소용없고 화면이 재연결 안내로 전환되므로 retry 끔.
export default function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } }))
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
