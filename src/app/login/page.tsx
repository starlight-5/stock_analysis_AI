'use client'
import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  background: '#131626',
  border: '1px solid #2D3460',
  borderRadius: 8,
  color: '#ECEEF8',
  fontSize: 14,
  boxSizing: 'border-box',
  outline: 'none',
}

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const result = await signIn('credentials', { email, password, redirect: false })

    if (result?.error) {
      setError('이메일 또는 비밀번호가 올바르지 않습니다.')
      setLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  const handleGoogle = () => signIn('google', { callbackUrl: '/' })

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#131626',
      padding: '20px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 400,
        background: '#1C2038',
        border: '1px solid #2D3460',
        borderRadius: 12,
        padding: '40px 32px',
      }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: '#ECEEF8' }}>
          로그인
        </h1>
        <p style={{ margin: '0 0 28px', color: '#7A82A8', fontSize: 13 }}>
          주식 분석 대시보드에 오신 걸 환영합니다.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 12, color: '#7A82A8' }}>이메일</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              required placeholder="example@email.com" style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 12, color: '#7A82A8' }}>비밀번호</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              required placeholder="8자 이상" style={inputStyle} />
          </div>

          {error && <p style={{ margin: 0, color: '#FF8585', fontSize: 13 }}>{error}</p>}

          <button type="submit" disabled={loading} style={{
            padding: '11px',
            background: loading ? '#2D3460' : '#3B6EFF',
            color: '#fff',
            border: 'none', borderRadius: 8,
            fontSize: 14, fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            marginTop: 4,
          }}>
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
          <div style={{ flex: 1, height: 1, background: '#2D3460' }} />
          <span style={{ color: '#404880', fontSize: 12 }}>또는</span>
          <div style={{ flex: 1, height: 1, background: '#2D3460' }} />
        </div>

        <button onClick={handleGoogle} style={{
          width: '100%', padding: '11px',
          background: '#fff', color: '#111',
          border: 'none', borderRadius: 8,
          fontSize: 14, fontWeight: 600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 002.38-5.88c0-.57-.05-.66-.15-1.18z"/>
            <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2.01c-.72.48-1.63.76-2.7.76-2.07 0-3.83-1.4-4.46-3.29H1.86v2.07A8 8 0 008.98 17z"/>
            <path fill="#FBBC05" d="M4.52 10.52A4.8 4.8 0 014.27 9c0-.52.09-1.02.25-1.52V5.41H1.86A8 8 0 001 9c0 1.3.31 2.53.86 3.59l2.66-2.07z"/>
            <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 001.86 5.4L4.52 7.48C5.15 5.59 6.91 4.18 8.98 4.18z"/>
          </svg>
          Google로 계속하기
        </button>

        <p style={{ margin: '20px 0 0', textAlign: 'center', color: '#7A82A8', fontSize: 13 }}>
          계정이 없으신가요?{' '}
          <Link href="/register" style={{ color: '#5B8BFF', textDecoration: 'none' }}>회원가입</Link>
        </p>
      </div>
    </div>
  )
}
