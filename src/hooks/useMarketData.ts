'use client'
import { useEffect, useState } from 'react'
import type { MarketData } from '@/types/market'
import { useRefreshTick } from './useRefreshTick'

export function useMarketData(): MarketData | null {
  const [market, setMarket] = useState<MarketData | null>(null)
  const tick = useRefreshTick()

  useEffect(() => {
    let isMounted = true
    const ctrl = new AbortController()
    const doFetch = async () => {
      try {
        const r = await fetch('/api/market', { signal: ctrl.signal })
        const d = await r.json()
        if (isMounted && !d.error) setMarket(d)
      } catch {}
    }
    doFetch()
    return () => { isMounted = false; ctrl.abort() }
  }, [tick])
  return market
}
