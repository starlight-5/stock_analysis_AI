'use client'
import { useEffect, useState } from 'react'
import type { QuoteData } from '@/app/api/quotes/route'

export type WatchQuotes = Record<string, QuoteData | null>

export function useWatchlistData(tickers: string[]) {
  const [quotes, setQuotes] = useState<WatchQuotes>({})
  const key = tickers.join(',')

  useEffect(() => {
    if (!tickers.length) return
    const ctrl = new AbortController()
    const doFetch = async () => {
      try {
        const r    = await fetch(`/api/quotes?tickers=${key}`, { signal: ctrl.signal })
        const data = await r.json()
        if (!ctrl.signal.aborted) setQuotes(data)
      } catch {}
    }
    doFetch()
    const id = setInterval(doFetch, 5 * 60 * 1000)
    return () => { ctrl.abort(); clearInterval(id) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return { quotes }
}
