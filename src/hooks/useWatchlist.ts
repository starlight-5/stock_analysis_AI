'use client'
/**
 * useWatchlist
 * 관심종목 목록을 /api/watchlist에서 가져오고, 추가/삭제 CRUD를 제공하는 훅.
 * 로그인 사용자의 관심종목이 없으면 DEFAULT_WATCHLIST(5개 대형 해외주) 를 표시한다.
 * add()는 Promise<WatchlistItem | null>를 반환해 실패 시 호출측에서 에러 피드백이 가능하다.
 */
import { useEffect, useState, useMemo, useCallback } from 'react'
import type { WatchlistItem } from '@/types/stock'

const DEFAULT_WATCHLIST: Omit<WatchlistItem, 'id' | 'addedAt'>[] = [
  { ticker: 'AAPL', name: 'Apple' },
  { ticker: 'MSFT', name: 'Microsoft' },
  { ticker: 'NVDA', name: 'NVIDIA' },
  { ticker: 'META', name: 'Meta' },
  { ticker: 'GOOGL', name: 'Alphabet' },
]

export function useWatchlist() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    const ctrl = new AbortController()
    const doFetch = async () => {
      try {
        const r    = await fetch('/api/watchlist', { signal: ctrl.signal })
        const data = await r.json()
        if (ctrl.signal.aborted) return
        setWatchlist(
          Array.isArray(data) && data.length > 0
            ? data
            : DEFAULT_WATCHLIST.map((w, i) => ({
                ...w, id: `default-${i}`, addedAt: new Date().toISOString(),
              }))
        )
      } catch {}
      if (!ctrl.signal.aborted) setLoading(false)
    }
    doFetch()
    return () => ctrl.abort()
  }, [])

  // [FIX 5] 반환 타입을 Promise<WatchlistItem | null>로 명시 →
  // RankingRow에서 결과를 받아 에러 피드백 가능
  const add = useCallback(async (ticker: string, name: string): Promise<WatchlistItem | null> => {
    try {
      const res  = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker, name }),
      })
      const item: WatchlistItem & { error?: string } = await res.json()
      if (item.error) return null
      setWatchlist(prev => [...prev, item])
      return item
    } catch { return null }
  }, [])

  const remove = useCallback(async (ticker: string) => {
    await fetch(`/api/watchlist?ticker=${ticker}`, { method: 'DELETE' })
    setWatchlist(prev => prev.filter(w => w.ticker !== ticker))
  }, [])

  const watchedSet = useMemo(() => new Set(watchlist.map(w => w.ticker)), [watchlist])

  return { watchlist, watchedSet, add, remove, loading }
}
