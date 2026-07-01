'use client'
/**
 * BottomNav
 * 모바일 화면 하단에 고정되는 내비게이션 바.
 * 현재 경로(pathname)에 따라 활성 탭을 강조하며,
 * 세션 상태에 따라 로그인/로그아웃 항목을 조건부 표시한다.
 */

import { usePathname, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'

export default function BottomNav() {
  const pathname = usePathname()
  const router   = useRouter()
  const { data: session, status } = useSession()
  const isAdmin = (session?.user as any)?.isAdmin
  const [activeCount, setActiveCount] = useState(0)

  useEffect(() => {
    if (status !== 'authenticated') return
    const doFetch = async () => {
      try {
        const r    = await fetch('/api/positions')
        const data = await r.json()
        if (Array.isArray(data)) {
          setActiveCount(data.filter((p: { status: string }) => p.status === 'active').length)
        }
      } catch {}
    }
    doFetch()
  }, [pathname, status])

  if (status === 'unauthenticated' || pathname === '/login' || pathname === '/register') {
    return null
  }

  const tabs = [
    { path: '/',          label: '홈',    icon: '⌂' },
    { path: '/positions', label: '포지션', icon: '📌', badge: activeCount || undefined },
    ...(isAdmin ? [{ path: '/admin', label: '관리', icon: '⚙' }] : []),
    { path: '/settings',  label: '설정',   icon: '☰' },
  ]

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
      height: 64,
      background: 'var(--color-background-primary)',
      borderTop: '1px solid var(--color-border-secondary)',
      display: 'flex',
      boxShadow: '0 -4px 20px rgba(0,0,0,0.4)',
    }}>
      {tabs.map((tab, idx) => {
        const active = pathname === tab.path
        return (
          <button
            key={tab.path}
            onClick={() => router.push(tab.path)}
            style={{
              flex: 1,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 4, position: 'relative',
              background: 'none',
              borderTop: `2px solid ${active ? 'var(--color-accent-primary)' : 'transparent'}`,
              borderLeft: idx > 0 ? '1px solid var(--color-border-secondary)' : 'none',
              borderRight: 'none',
              borderBottom: 'none',
              cursor: 'pointer',
              color: active ? 'var(--color-accent-light)' : 'var(--color-text-secondary)',
              transition: 'color 0.15s',
            }}
          >
            <div style={{
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 3,
              padding: '6px 20px',
              borderRadius: 10,
              background: active ? 'rgba(59,110,255,0.12)' : 'transparent',
              transition: 'background 0.15s',
            }}>
              <span style={{ fontSize: 20, lineHeight: 1 }}>{tab.icon}</span>
              <span style={{ fontSize: 11, fontWeight: active ? 700 : 500, letterSpacing: '0.2px' }}>
                {tab.label}
              </span>
            </div>

            {tab.badge != null && (
              <span style={{
                position: 'absolute', top: 10, left: 'calc(50% + 12px)',
                background: 'var(--color-negative)', color: '#fff',
                fontSize: 9, fontWeight: 700, lineHeight: 1,
                padding: '2px 4px', borderRadius: 8, minWidth: 14, textAlign: 'center',
              }}>
                {tab.badge}
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}
