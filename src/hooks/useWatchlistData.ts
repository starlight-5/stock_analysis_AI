'use client'
/**
 * useWatchlistData
 * 관심종목 티커 목록의 현재가·등락률을 /api/quotes에서 가져오는 훅.
 * useRefreshTick의 공용 tick에 의존해 시계 기준 5분마다 자동 갱신된다.
 */
import { useEffect, useState } from 'react'
import type { QuoteData } from '@/app/api/quotes/route'
import { useRefreshTick } from './useRefreshTick'

/** 티커 → QuoteData 맵 (null = 조회 실패 또는 미지원 종목) */
export type WatchQuotes = Record<string, QuoteData | null>

export function useWatchlistData(tickers: string[]) {
  const [quotes, setQuotes] = useState<WatchQuotes>({})
  const tick = useRefreshTick()          // 시계 기준 5분 tick
  const key = tickers.join(',')          // 티커 목록이 바뀌면 즉시 재fetch

  useEffect(() => {
    if (!tickers.length) return
    const ctrl = new AbortController()   // 언마운트 또는 deps 변경 시 이전 요청 취소
    const doFetch = async () => {
      try {
        const r    = await fetch(`/api/quotes?tickers=${key}`, { signal: ctrl.signal })
        const data = await r.json()
        if (!ctrl.signal.aborted) setQuotes(data)
      } catch {}
    }
    doFetch()
    return () => ctrl.abort()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick])                        // key 변경(종목 추가/삭제) 또는 tick마다 재실행

  return { quotes }
}
