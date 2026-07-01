'use client'

import { useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function SettingsPage() {
  const { data: session, status } = useSession()
  const router  = useRouter()
  const isAdmin = (session?.user as any)?.isAdmin

  const [confirm,  setConfirm]  = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  if (status === 'unauthenticated') { router.push('/login'); return null }
  if (status === 'loading') return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>로딩 중...</span>
    </div>
  )

  const handleDelete = async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch('/api/auth/delete-account', { method: 'DELETE' })
      const data = await r.json()
      if (data.error) { setError(data.error); setLoading(false); return }
      await signOut({ callbackUrl: '/login' })
    } catch {
      setError('오류가 발생했습니다. 다시 시도해주세요.')
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background-tertiary)', padding: '68px 24px 100px' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div style={{ marginBottom: 32 }}>
          <a href="/" style={{ color: 'var(--color-text-secondary)', fontSize: 13, textDecoration: 'none' }}>← 홈</a>
          <h1 style={{ margin: '12px 0 4px', fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)' }}>계정 설정</h1>
        </div>

        {/* 계정 정보 */}
        <div style={{
          background: 'var(--color-background-primary)', border: '1px solid var(--color-border-secondary)',
          borderRadius: 12, padding: '20px',  marginBottom: 24,
        }}>
          <p style={{ margin: '0 0 4px', fontSize: 12, color: 'var(--color-text-secondary)' }}>로그인 계정</p>
          <p style={{ margin: 0, fontSize: 15, color: 'var(--color-text-primary)', fontWeight: 500 }}>
            {session?.user?.email}
            {isAdmin && (
              <span style={{
                marginLeft: 8, fontSize: 11, padding: '2px 8px', borderRadius: 10,
                background: 'rgba(29,158,117,0.15)', color: 'var(--color-positive-dark)',
                border: '1px solid rgba(29,158,117,0.4)',
              }}>관리자</span>
            )}
          </p>
        </div>

        {/* 계정 탈퇴 */}
        <div style={{
          background: 'var(--color-background-primary)', border: '1px solid var(--color-border-secondary)',
          borderRadius: 12, padding: '20px',
        }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>계정 탈퇴</h2>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
            탈퇴 시 포지션, 관심종목 등 모든 데이터가 영구 삭제됩니다.
          </p>

          {isAdmin ? (
            <p style={{ margin: 0, fontSize: 13, color: '#FFA032' }}>
              관리자 계정은 탈퇴할 수 없습니다.
            </p>
          ) : !confirm ? (
            <button
              onClick={() => setConfirm(true)}
              style={{
                padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                background: 'rgba(226,75,74,0.1)', color: 'var(--color-negative-dark)',
                border: '1px solid rgba(226,75,74,0.3)', cursor: 'pointer',
              }}
            >
              계정 탈퇴
            </button>
          ) : (
            <div style={{
              background: 'rgba(226,75,74,0.08)', border: '1px solid rgba(226,75,74,0.3)',
              borderRadius: 8, padding: '14px',
              display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--color-negative-dark)', fontWeight: 500 }}>
                정말 탈퇴하시겠습니까? 이 작업은 되돌릴 수 없습니다.
              </p>
              {error && <p style={{ margin: 0, fontSize: 13, color: 'var(--color-error-text)' }}>{error}</p>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handleDelete}
                  disabled={loading}
                  style={{
                    padding: '8px 20px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                    background: loading ? 'var(--color-border-secondary)' : 'var(--color-negative-dark)', color: '#fff',
                    border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {loading ? '처리 중...' : '탈퇴 확인'}
                </button>
                <button
                  onClick={() => { setConfirm(false); setError(null) }}
                  disabled={loading}
                  style={{
                    padding: '8px 20px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                    background: 'none', color: 'var(--color-text-secondary)',
                    border: '1px solid var(--color-border-secondary)', cursor: 'pointer',
                  }}
                >
                  취소
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
