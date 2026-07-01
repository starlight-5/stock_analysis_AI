'use client'
/**
 * AuthGuard
 * 로그인 세션을 확인하여 비로그인 사용자를 /login으로 리다이렉트하는 래퍼.
 * 세션 로딩 중에는 전체 화면 로딩 UI를 표시하고, 비인증 확정 시 null 반환 (React는 아무것도 렌더링 안 함).
 */
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login')
  }, [status, router])

  if (status === 'loading') {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0f0f0f',
        color: '#666',
        fontSize: 14,
      }}>
        로딩 중...
      </div>
    )
  }

  if (status === 'unauthenticated') return null

  return <>{children}</>
}
