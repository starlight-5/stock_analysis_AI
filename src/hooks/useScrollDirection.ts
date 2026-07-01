'use client'
/**
 * useScrollDirection
 * 스크롤 방향(up | down)을 감지하는 훅.
 * requestAnimationFrame throttle로 성능을 보호하며,
 * threshold(기본 8px) 미만의 미세 스크롤은 무시한다.
 * 헤더의 MarketStatusBar 숨김/표시 애니메이션에 사용된다.
 */
import { useState, useEffect } from 'react'

export type ScrollDirection = 'up' | 'down'

/** @param threshold 방향 전환으로 인식할 최소 스크롤 거리(px), 기본 8 */
export function useScrollDirection(threshold = 8): ScrollDirection {
  const [dir, setDir] = useState<ScrollDirection>('up')

  useEffect(() => {
    let lastY = window.scrollY
    let rafId = 0

    const onScroll = () => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        const y = window.scrollY
        if (y <= 0) { setDir('up'); lastY = 0; return }
        const delta = y - lastY
        if (Math.abs(delta) < threshold) return
        setDir(delta > 0 ? 'down' : 'up')
        lastY = y
      })
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(rafId)
    }
  }, [threshold])

  return dir
}
