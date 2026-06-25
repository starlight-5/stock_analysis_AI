'use client'
import { useSession, signOut } from 'next-auth/react'
import { useState } from 'react'

export default function Header() {
  const { data: session } = useSession()
  const [open, setOpen] = useState(false)

  if (!session) return null

  const initial = session.user.name?.[0]?.toUpperCase() ?? session.user.email?.[0]?.toUpperCase() ?? '?'
  const displayName = session.user.name ?? session.user.email ?? '사용자'

  return (
    <header style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      height: 48,
      background: '#111',
      borderBottom: '1px solid #222',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px',
      zIndex: 100,
    }}>
      <span style={{ fontSize: 14, fontWeight: 700, color: '#fff', letterSpacing: '-0.3px' }}>
        주식 분석
      </span>

      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'none',
            border: '1px solid #333',
            borderRadius: 20,
            padding: '4px 10px 4px 6px',
            cursor: 'pointer',
            color: '#fff',
          }}
        >
          {session.user.image ? (
            <img
              src={session.user.image}
              alt=""
              style={{ width: 24, height: 24, borderRadius: '50%' }}
            />
          ) : (
            <div style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: '#2563eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 700,
              color: '#fff',
            }}>
              {initial}
            </div>
          )}
          <span style={{ fontSize: 13, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {displayName}
          </span>
        </button>

        {open && (
          <>
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 110 }}
              onClick={() => setOpen(false)}
            />
            <div style={{
              position: 'absolute',
              top: 40,
              right: 0,
              background: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: 8,
              minWidth: 160,
              zIndex: 120,
              overflow: 'hidden',
            }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #222' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 2 }}>
                  {session.user.name ?? '-'}
                </div>
                <div style={{ fontSize: 11, color: '#666' }}>
                  {session.user.email}
                </div>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  background: 'none',
                  border: 'none',
                  color: '#f56565',
                  fontSize: 13,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                로그아웃
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  )
}
