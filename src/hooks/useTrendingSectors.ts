'use client'
import { useEffect, useState } from 'react'
import type { TrendingSectorsData } from '@/app/api/trending-sectors/route'

export function useTrendingSectors() {
  const [data, setData] = useState<TrendingSectorsData | null>(null)
  useEffect(() => {
    const doFetch = async () => {
      try {
        const r    = await fetch('/api/trending-sectors')
        const data = await r.json()
        setData(data)
      } catch {}
    }
    doFetch()
  }, [])
  return data
}
