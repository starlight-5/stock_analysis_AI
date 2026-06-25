'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'

export default function BottomNav() {
  const pathname = usePathname()
  const router   = useRouter()
  const { status } = useSession()
  const [activeCount, setActiveCount] = useState(0)

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/positions')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setActiveCount(data.filter((p: { status: string }) => p.status === 'active').length)
        }
      })
      .catch(() => {})
  }, [pathname, status])

  // 로그인/회원가입 페이지에는 표시 안 함
  if (status === 'unauthenticated' || pathname === '/login' || pathname === '/register') {
    return null
  }

  const tabs = [
    { path: '/',          label: '홈',      icon: '⌂'  },
    { path: '/positions', label: '포지션',  icon: '📌', badge: activeCount || undefined },
  ]

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
      height: 64,
      background: '#252B45',
      borderTop: '1px solid #404880',
      display: 'flex',
      boxShadow: '0 -6px 24px rgba(0,0,0,0.6)',
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
              gap: 3, position: 'relative',
              background: active ? 'rgba(91,139,255,0.08)' : 'none',
              borderTop: active ? '2px solid #5B8BFF' : '2px solid transparent',
              borderLeft: idx > 0 ? '1px solid #404880' : 'none',
              borderRight: 'none',
              borderBottom: 'none',
              cursor: 'pointer',
              color: active ? '#5B8BFF' : '#9AA3C8',
              transition: 'all 0.15s',
            }}
          >
            <span style={{ fontSize: 22, lineHeight: 1 }}>{tab.icon}</span>
            <span style={{ fontSize: 11, fontWeight: active ? 700 : 400 }}>{tab.label}</span>

            {tab.badge != null && (
              <span style={{
                position: 'absolute', top: 8, left: 'calc(50% + 6px)',
                background: '#FF5A5A', color: '#fff',
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
