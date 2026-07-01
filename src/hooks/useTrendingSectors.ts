'use client'
/**
 * useTrendingSectors
 * 현재 강한 섹터 데이터를 /api/trending-sectors에서 한 번만 가져오는 훅.
 * 서버 캐시(3시간)가 있어 반복 호출 시 API 쿼터를 소모하지 않는다.
 */
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
