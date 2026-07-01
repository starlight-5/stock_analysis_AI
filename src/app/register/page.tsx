'use client'
import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  background: 'var(--color-background-tertiary)',
  border: '1px solid var(--color-border-secondary)',
  borderRadius: 8,
  color: 'var(--color-text-primary)',
  fontSize: 14,
  boxSizing: 'border-box',
  outline: 'none',
}

export default function RegisterPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password !== confirm) { setError('비밀번호가 일치하지 않습니다.'); return }
    if (password.length < 8)  { setError('비밀번호는 8자 이상이어야 합니다.'); return }
    setLoading(true)

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error || '회원가입에 실패했습니다.')
      setLoading(false)
      return
    }

    const result = await signIn('credentials', { email, password, redirect: false })
    if (result?.error) router.push('/login')
    else { router.push('/'); router.refresh() }
  }

  const handleGoogle = () => signIn('google', { callbackUrl: '/' })

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-background-tertiary)',
      padding: '20px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 400,
        background: 'var(--color-background-primary)',
        border: '1px solid var(--color-border-secondary)',
        borderRadius: 12,
        padding: '40px 32px',
      }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)' }}>
          회원가입
        </h1>
        <p style={{ margin: '0 0 28px', color: 'var(--color-text-secondary)', fontSize: 13 }}>
          계정을 만들어 포지션과 관심종목을 관리하세요.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 12, color: 'var(--color-text-secondary)' }}>이름 (선택)</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="홍길동" style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 12, color: 'var(--color-text-secondary)' }}>이메일</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              required placeholder="example@email.com" style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 12, color: 'var(--color-text-secondary)' }}>비밀번호</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              required placeholder="8자 이상" style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 12, color: 'var(--color-text-secondary)' }}>비밀번호 확인</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              required placeholder="비밀번호 재입력" style={inputStyle} />
          </div>

          {error && <p style={{ margin: 0, color: 'var(--color-error-text)', fontSize: 13 }}>{error}</p>}

          <button type="submit" disabled={loading} style={{
            padding: '11px',
            background: loading ? 'var(--color-border-secondary)' : 'var(--color-accent-primary)',
            color: '#fff',
            border: 'none', borderRadius: 8,
            fontSize: 14, fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            marginTop: 4,
          }}>
            {loading ? '처리 중...' : '회원가입'}
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--color-border-secondary)' }} />
          <span style={{ color: 'var(--color-border-primary)', fontSize: 12 }}>또는</span>
          <div style={{ flex: 1, height: 1, background: 'var(--color-border-secondary)' }} />
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

        <p style={{ margin: '20px 0 0', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 13 }}>
          이미 계정이 있으신가요?{' '}
          <Link href="/login" style={{ color: 'var(--color-accent-light)', textDecoration: 'none' }}>로그인</Link>
        </p>
      </div>
    </div>
  )
}
