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
      top: 0, left: 0, right: 0,
      height: 48,
      background: '#1C2038',
      borderBottom: '1px solid #2D3460',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px',
      zIndex: 100,
      boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
    }}>
      <span style={{ fontSize: 15, fontWeight: 700, color: '#ECEEF8', letterSpacing: '-0.3px' }}>
        주식 분석
      </span>

      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid #404880',
            borderRadius: 20,
            padding: '4px 10px 4px 6px',
            cursor: 'pointer',
            color: '#ECEEF8',
          }}
        >
          {session.user.image ? (
            <img src={session.user.image} alt=""
              style={{ width: 24, height: 24, borderRadius: '50%' }} />
          ) : (
            <div style={{
              width: 24, height: 24, borderRadius: '50%',
              background: '#3B6EFF',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: '#fff',
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
            <div style={{ position: 'fixed', inset: 0, zIndex: 110 }} onClick={() => setOpen(false)} />
            <div style={{
              position: 'absolute',
              top: 42, right: 0,
              background: '#1C2038',
              border: '1px solid #404880',
              borderRadius: 10,
              minWidth: 180,
              zIndex: 120,
              overflow: 'hidden',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #2D3460' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#ECEEF8', marginBottom: 2 }}>
                  {session.user.name ?? '-'}
                </div>
                <div style={{ fontSize: 11, color: '#7A82A8' }}>
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
                  color: '#FF8585',
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
