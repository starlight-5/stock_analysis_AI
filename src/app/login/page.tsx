'use client'
import { useState, useEffect } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
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
  const router       = useRouter()
  const searchParams = useSearchParams()
  const [email,        setEmail]        = useState('')
  const [password,     setPassword]     = useState('')
  const [error,        setError]        = useState('')
  const [denied,       setDenied]       = useState(false)
  const [googleDenied, setGoogleDenied] = useState(false)
  const [requestEmail, setRequestEmail] = useState('')
  const [requested,    setRequested]    = useState(false)
  const [loading,      setLoading]      = useState(false)
  const [reqLoading,   setReqLoading]   = useState(false)

  useEffect(() => {
    if (searchParams.get('error') === 'AccessDenied') {
      setDenied(true)
      setGoogleDenied(true)
    }
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setDenied(false)
    setRequested(false)

    const result = await signIn('credentials', { email, password, redirect: false })

    if (!result?.error) {
      router.push('/')
      router.refresh()
      return
    }

    if (result.error === 'AccessDenied') {
      // 케이스 3: 올바른 계정이지만 허용되지 않은 사용자
      setDenied(true)
    } else {
      // 케이스 2, 4: 틀린 이메일 또는 비밀번호
      setError('이메일 또는 비밀번호가 올바르지 않습니다.')
    }
    setLoading(false)
  }

  const handleRequestAccess = async () => {
    const targetEmail = googleDenied ? requestEmail : email
    if (!targetEmail) return
    setReqLoading(true)
    await fetch('/api/auth/request-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: targetEmail }),
    })
    setRequested(true)
    setReqLoading(false)
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
            <input type="email" value={email} onChange={e => { setEmail(e.target.value); setDenied(false); setError('') }}
              required placeholder="example@email.com" style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 12, color: '#7A82A8' }}>비밀번호</label>
            <input type="password" value={password} onChange={e => { setPassword(e.target.value); setDenied(false); setError('') }}
              required placeholder="8자 이상" style={inputStyle} />
          </div>

          {/* 케이스 2, 4: 틀린 자격증명 */}
          {error && (
            <p style={{ margin: 0, color: '#FF8585', fontSize: 13 }}>{error}</p>
          )}

          {/* 케이스 3: 허용되지 않은 사용자 */}
          {denied && !requested && (
            <div style={{
              background: 'rgba(255,90,90,0.08)',
              border: '1px solid rgba(255,90,90,0.3)',
              borderRadius: 8,
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}>
              <p style={{ margin: 0, color: '#FF8585', fontSize: 13 }}>
                허용되지 않은 사용자입니다.
              </p>
              <button
                type="button"
                onClick={handleRequestAccess}
                disabled={reqLoading}
                style={{
                  padding: '8px 12px',
                  background: reqLoading ? '#2D3460' : 'rgba(255,90,90,0.15)',
                  color: '#FF8585',
                  border: '1px solid rgba(255,90,90,0.4)',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: reqLoading ? 'not-allowed' : 'pointer',
                  width: '100%',
                }}
              >
                {reqLoading ? '요청 전송 중...' : '관리자에게 접근 요청 보내기'}
              </button>
            </div>
          )}

          {/* 요청 완료 */}
          {requested && (
            <div style={{
              background: 'rgba(59,110,255,0.08)',
              border: '1px solid rgba(59,110,255,0.3)',
              borderRadius: 8,
              padding: '12px 14px',
            }}>
              <p style={{ margin: 0, color: '#5B8BFF', fontSize: 13 }}>
                ✓ 접근 요청이 전송되었습니다. 관리자 승인 후 이용 가능합니다.
              </p>
            </div>
          )}

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

        {/* 구글 로그인 — 이미 이메일/비번 계정 존재 */}
        {searchParams.get('error') === 'OAuthAccountNotLinked' && (
          <div style={{
            background: 'rgba(255,160,50,0.08)',
            border: '1px solid rgba(255,160,50,0.3)',
            borderRadius: 8, padding: '12px 14px',
          }}>
            <p style={{ margin: 0, color: '#FFA032', fontSize: 13 }}>
              이미 이메일/비밀번호로 가입된 계정입니다. 아래 이메일 로그인을 이용해주세요.
            </p>
          </div>
        )}

        {/* 구글 로그인 거부 시 */}
        {googleDenied && !requested && (
          <div style={{
            background: 'rgba(255,90,90,0.08)',
            border: '1px solid rgba(255,90,90,0.3)',
            borderRadius: 8, padding: '12px 14px',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <p style={{ margin: 0, color: '#FF8585', fontSize: 13 }}>
              허용되지 않은 Google 계정입니다.
            </p>
            <input
              type="email"
              value={requestEmail}
              onChange={e => setRequestEmail(e.target.value)}
              placeholder="Google 이메일 입력"
              style={{ ...inputStyle, fontSize: 13, padding: '8px 12px' }}
            />
            <button
              type="button"
              onClick={handleRequestAccess}
              disabled={reqLoading || !requestEmail}
              style={{
                padding: '8px 12px',
                background: (reqLoading || !requestEmail) ? '#2D3460' : 'rgba(255,90,90,0.15)',
                color: '#FF8585',
                border: '1px solid rgba(255,90,90,0.4)',
                borderRadius: 6, fontSize: 12, fontWeight: 600,
                cursor: (reqLoading || !requestEmail) ? 'not-allowed' : 'pointer',
                width: '100%',
              }}
            >
              {reqLoading ? '요청 전송 중...' : '관리자에게 접근 요청 보내기'}
            </button>
          </div>
        )}

        {/* 구글 요청 완료 */}
        {googleDenied && requested && (
          <div style={{
            background: 'rgba(59,110,255,0.08)',
            border: '1px solid rgba(59,110,255,0.3)',
            borderRadius: 8, padding: '12px 14px',
          }}>
            <p style={{ margin: 0, color: '#5B8BFF', fontSize: 13 }}>
              ✓ 접근 요청이 전송되었습니다. 관리자 승인 후 이용 가능합니다.
            </p>
          </div>
        )}

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
