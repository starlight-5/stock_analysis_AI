'use client'
/**
 * useMarketData
 * 주요 시장 지수 및 환율 데이터를 /api/market에서 가져오는 훅.
 * useRefreshTick의 공용 5분 tick을 구독하여 정시(00, 05, 10...) 단위로 갱신된다.
 */
import { useEffect, useState } from 'react'
import type { MarketData } from '@/types/market'
import { useRefreshTick } from './useRefreshTick'

export function useMarketData(): MarketData | null {
  const [market, setMarket] = useState<MarketData | null>(null)
  const tick = useRefreshTick() // 공용 5분 tick 타이머

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
  }, [tick]) // 5분 tick이 튈 때마다 fetch 재실행
  return market
}
