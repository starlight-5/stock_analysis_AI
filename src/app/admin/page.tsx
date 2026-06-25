'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

type AccessRequest = {
  id:          string
  email:       string
  status:      'pending' | 'approved' | 'rejected'
  requestedAt: string
  reviewedAt:  string | null
}

type UserRow = {
  id:        string
  email:     string | null
  name:      string | null
  createdAt: string
}

const STATUS_LABEL: Record<string, string> = {
  pending:  '대기',
  approved: '승인',
  rejected: '거부',
}

const STATUS_COLOR: Record<string, string> = {
  pending:  '#FFA032',
  approved: '#1D9E75',
  rejected: '#E24B4A',
}

export default function AdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [requests, setRequests] = useState<AccessRequest[]>([])
  const [users,    setUsers]    = useState<UserRow[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    if (status !== 'authenticated') return

    const doFetch = async () => {
      try {
        const [reqRes, usersRes] = await Promise.all([
          fetch('/api/admin/requests'),
          fetch('/api/admin/users'),
        ])
        const [reqData, usersData] = await Promise.all([reqRes.json(), usersRes.json()])
        if (reqData.error) { setError(reqData.error); return }
        setRequests(reqData)
        setUsers(usersData)
      } catch {
        setError('데이터 로드 실패')
      } finally {
        setLoading(false)
      }
    }
    doFetch()
  }, [status, router])

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('이 사용자를 삭제하시겠습니까? 포지션, 관심종목 등 모든 데이터가 영구 삭제됩니다.')) return
    try {
      const r    = await fetch('/api/admin/users', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ userId }),
      })
      const data = await r.json()
      if (data.error) { alert(data.error); return }
      setUsers(prev => prev.filter(u => u.id !== userId))
    } catch {}
  }

  const handleAction = async (id: string, action: 'approved' | 'rejected') => {
    try {
      const r    = await fetch('/api/admin/requests', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id, status: action }),
      })
      const data = await r.json()
      if (data.error) return
      setRequests(prev => prev.map(req => req.id === id ? { ...req, ...data } : req))
    } catch {}
  }

  if (status === 'loading' || loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#131626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#7A82A8', fontSize: 14 }}>로딩 중...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: '#131626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#FF8585', fontSize: 14 }}>{error}</span>
      </div>
    )
  }

  const pending  = requests.filter(r => r.status === 'pending')
  const reviewed = requests.filter(r => r.status !== 'pending')

  return (
    <div style={{ minHeight: '100vh', background: '#131626', padding: '68px 24px 100px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div style={{ marginBottom: 32 }}>
          <a href="/" style={{ color: '#7A82A8', fontSize: 13, textDecoration: 'none' }}>← 홈</a>
          <h1 style={{ margin: '12px 0 4px', fontSize: 22, fontWeight: 700, color: '#ECEEF8' }}>접근 요청 관리</h1>
          <p style={{ margin: 0, color: '#7A82A8', fontSize: 13 }}>
            {session?.user?.email}
          </p>
        </div>

        {/* 대기 중 */}
        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#FFA032', marginBottom: 12 }}>
            대기 중 ({pending.length})
          </h2>
          {pending.length === 0 ? (
            <p style={{ color: '#7A82A8', fontSize: 13 }}>대기 중인 요청이 없습니다.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pending.map(req => (
                <div key={req.id} style={{
                  background: '#1C2038', border: '1px solid #2D3460',
                  borderRadius: 10, padding: '14px 16px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                }}>
                  <div>
                    <p style={{ margin: '0 0 4px', color: '#ECEEF8', fontSize: 14, fontWeight: 500 }}>{req.email}</p>
                    <p style={{ margin: 0, color: '#7A82A8', fontSize: 12 }}>
                      {new Date(req.requestedAt).toLocaleString('ko-KR')}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button
                      onClick={() => handleAction(req.id, 'approved')}
                      style={{
                        padding: '7px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                        background: 'rgba(29,158,117,0.15)', color: '#1D9E75',
                        border: '1px solid rgba(29,158,117,0.4)', cursor: 'pointer',
                      }}
                    >
                      승인
                    </button>
                    <button
                      onClick={() => handleAction(req.id, 'rejected')}
                      style={{
                        padding: '7px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                        background: 'rgba(226,75,74,0.1)', color: '#E24B4A',
                        border: '1px solid rgba(226,75,74,0.3)', cursor: 'pointer',
                      }}
                    >
                      거부
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 처리 완료 */}
        {reviewed.length > 0 && (
          <section style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: '#7A82A8', marginBottom: 12 }}>
              처리 완료 ({reviewed.length})
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {reviewed.map(req => (
                <div key={req.id} style={{
                  background: '#1C2038', border: '1px solid #2D3460',
                  borderRadius: 10, padding: '14px 16px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  opacity: 0.7,
                }}>
                  <div>
                    <p style={{ margin: '0 0 4px', color: '#ECEEF8', fontSize: 14 }}>{req.email}</p>
                    <p style={{ margin: 0, color: '#7A82A8', fontSize: 12 }}>
                      요청: {new Date(req.requestedAt).toLocaleString('ko-KR')}
                    </p>
                  </div>
                  <span style={{
                    fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                    color: STATUS_COLOR[req.status],
                    background: `${STATUS_COLOR[req.status]}22`,
                    border: `1px solid ${STATUS_COLOR[req.status]}55`,
                  }}>
                    {STATUS_LABEL[req.status]}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 사용자 관리 */}
        <section>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#E24B4A', marginBottom: 12 }}>
            사용자 관리 ({users.length})
          </h2>
          {users.length === 0 ? (
            <p style={{ color: '#7A82A8', fontSize: 13 }}>등록된 사용자가 없습니다.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {users.map(u => {
                const isSelf = u.email === session?.user?.email
                return (
                  <div key={u.id} style={{
                    background: '#1C2038', border: '1px solid #2D3460',
                    borderRadius: 10, padding: '14px 16px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  }}>
                    <div>
                      <p style={{ margin: '0 0 2px', color: '#ECEEF8', fontSize: 14, fontWeight: 500 }}>
                        {u.email ?? '(이메일 없음)'}
                        {isSelf && (
                          <span style={{
                            marginLeft: 8, fontSize: 11, padding: '2px 7px', borderRadius: 10,
                            background: 'rgba(29,158,117,0.15)', color: '#1D9E75',
                            border: '1px solid rgba(29,158,117,0.4)',
                          }}>관리자</span>
                        )}
                      </p>
                      <p style={{ margin: 0, color: '#7A82A8', fontSize: 12 }}>
                        {u.name ?? '이름 없음'} · 가입: {new Date(u.createdAt).toLocaleDateString('ko-KR')}
                      </p>
                    </div>
                    {!isSelf && (
                      <button
                        onClick={() => handleDeleteUser(u.id)}
                        style={{
                          padding: '7px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                          background: 'rgba(226,75,74,0.1)', color: '#E24B4A',
                          border: '1px solid rgba(226,75,74,0.3)', cursor: 'pointer',
                          flexShrink: 0,
                        }}
                      >
                        삭제
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
