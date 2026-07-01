'use client'
import { useEffect, useState } from 'react'
import type { MarketData } from '@/types/market'

export function useMarketData(): MarketData | null {
  const [market, setMarket] = useState<MarketData | null>(null)
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
    const id = setInterval(doFetch, 5 * 60 * 1000)
    return () => { isMounted = false; ctrl.abort(); clearInterval(id) }
  }, [])
  return market
}
