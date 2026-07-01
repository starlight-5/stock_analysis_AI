'use client'
import { useState, useEffect } from 'react'

export type ScrollDirection = 'up' | 'down'

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
