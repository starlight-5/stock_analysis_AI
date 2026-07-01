'use client'
import { useEffect, useState } from 'react'
import type { MarketTab } from '@/types/market'
import type { RankingItem } from '@/app/api/rankings/route'

export function useRankings(marketTab: MarketTab) {
  const [rankings,    setRankings]    = useState<RankingItem[] | null>(null)
  const [error,       setError]       = useState<string | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [refreshing,  setRefreshing]  = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  useEffect(() => {
    let isMounted = true
    const ctrl    = new AbortController()

    const doFetch = async (background: boolean) => {
      if (!isMounted) return
      if (background) setRefreshing(true)

      try {
        const res  = await fetch(`/api/rankings?market=${marketTab}`, { signal: ctrl.signal })
        const data = await res.json()
        if (!isMounted || ctrl.signal.aborted) return
        if (data.error) setError(data.error)
        else { setRankings(data); setError(null); setLastUpdated(new Date()) }
      } catch (e: any) {
        if (!isMounted || e.name === 'AbortError') return
        setError('랭킹 데이터 로드 실패')
      } finally {
        if (isMounted && !ctrl.signal.aborted) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    }

    // 탭 전환(초기 로드): 데이터 초기화 + 스피너
    setRankings(null); setError(null); setLoading(true); setRefreshing(false)
    doFetch(false)

    // 5분마다 백그라운드 자동 갱신 (기존 데이터 유지, 소형 스피너만 표시)
    const id = setInterval(() => doFetch(true), 5 * 60 * 1000)

    return () => {
      isMounted = false
      ctrl.abort()
      clearInterval(id)
    }
  }, [marketTab])

  return { rankings, error, loading, refreshing, lastUpdated }
}
