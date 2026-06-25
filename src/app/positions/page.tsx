'use client'

import { useEffect, useState, useCallback, memo } from 'react'
import { useRouter } from 'next/navigation'
import AuthGuard from '@/components/AuthGuard'
import type { Position } from '@/types/stock'

// ─── 유틸 ────────────────────────────────────────────────────────
const IS_KR = (t: string) => /^\d{6}$/.test(t)
const fmtCur = (ticker: string, p: number) =>
  IS_KR(ticker)
    ? `${p.toLocaleString('ko-KR')}원`
    : `$${p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const diffPct = (cur: number, target: number) => ((target - cur) / cur) * 100

const SIGNAL_META: Record<string, { label: string; color: string; bg: string }> = {
  strong_buy:  { label: '강력매수', color: '#085041', bg: '#E1F5EE' },
  buy:         { label: '매수',     color: '#27500A', bg: '#EAF3DE' },
  watch:       { label: '관망',     color: '#633806', bg: '#FAEEDA' },
  sell:        { label: '매도',     color: '#712B13', bg: '#FAECE7' },
  strong_sell: { label: '강력매도', color: '#791F1F', bg: '#FCEBEB' },
}

// ─── 훅 ──────────────────────────────────────────────────────────
function usePositions() {
  const [positions, setPositions] = useState<Position[]>([])
  const [prices,    setPrices]    = useState<Record<string, number | null>>({})

  const load = useCallback(async () => {
    const data = await fetch('/api/positions', { cache: 'no-store' }).then(r => r.json()).catch(() => [])
    if (Array.isArray(data)) setPositions(data)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const active = positions.filter(p => p.status === 'active')
    if (!active.length) return
    const tickers = active.map(p => p.ticker).join(',')
    fetch(`/api/prices?tickers=${tickers}`)
      .then(r => r.json())
      .then(setPrices)
      .catch(() => {})
  }, [positions])

  const close = useCallback(async (id: string) => {
    await fetch(`/api/positions?id=${id}`, { method: 'DELETE' })
    setPositions(prev => prev.map(p => p.id === id ? { ...p, status: 'closed' as const } : p))
  }, [])

  return { positions, prices, close, reload: load }
}

// ─── 포지션 카드 ──────────────────────────────────────────────────
const PositionCard = memo(function PositionCard({
  pos, cur, navigate, onClose,
}: {
  pos: Position
  cur: number | null
  navigate: (path: string) => void
  onClose: (id: string) => void
}) {
  const meta     = SIGNAL_META[pos.signal] ?? SIGNAL_META.watch
  const avgEntry = pos.entries.reduce((s, e) => s + e.price * (e.ratio / 100), 0)
  const retPct   = cur != null && avgEntry > 0 ? diffPct(avgEntry, cur) : null

  const elapsed  = Math.max(0, Math.floor((Date.now() - new Date(pos.registeredAt).getTime()) / 86400000))
  const elapsedW = elapsed / 7
  const barPct   = pos.holding ? Math.min(100, (elapsedW / pos.holding.maxWeeks) * 100) : 0
  const [barWidth, setBarWidth] = useState(0)
  useEffect(() => {
    const id = requestAnimationFrame(() => setBarWidth(barPct))
    return () => cancelAnimationFrame(id)
  }, [barPct])

  const Row = ({ label, price, badge, right, rightColor }: {
    label: string; price: string; badge?: string
    right?: string; rightColor?: string
  }) => (
    <div style={{
      display: 'grid', gridTemplateColumns: '52px 1fr auto auto',
      alignItems: 'center', gap: 6, fontSize: 11, marginBottom: 4,
    }}>
      <span style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{price}</span>
      {badge
        ? <span style={{
            fontSize: 10, padding: '1px 6px', borderRadius: 8,
            background: 'var(--color-background-secondary)',
            color: 'var(--color-text-secondary)',
            border: '0.5px solid var(--color-border-secondary)',
            whiteSpace: 'nowrap',
          }}>{badge}</span>
        : <span />}
      <span style={{ color: rightColor ?? 'var(--color-text-secondary)', textAlign: 'right', whiteSpace: 'nowrap' }}>
        {right}
      </span>
    </div>
  )

  const BarRow = ({ label, price, pct, reached }: {
    label: string; price: string; pct: number; reached: boolean
  }) => (
    <div style={{ marginBottom: 6 }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '52px 1fr auto',
        alignItems: 'center', gap: 6, fontSize: 11, marginBottom: 3,
      }}>
        <span style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
        <span style={{ fontWeight: 500 }}>{price}</span>
        <span style={{ color: reached ? '#1D9E75' : 'var(--color-text-secondary)', fontWeight: reached ? 600 : 400, whiteSpace: 'nowrap' }}>
          {reached ? '✓ 달성' : `+${pct.toFixed(1)}% 남음`}
        </span>
      </div>
      <div style={{ height: 3, borderRadius: 2, background: 'var(--color-background-secondary)', overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 2,
          background: reached ? '#1D9E75' : '#3B6EFF',
          width: `${Math.min(100, Math.max(0, 100 - pct))}%`,
          transition: 'width .4s',
        }} />
      </div>
    </div>
  )

  return (
    <div style={{
      background: 'var(--color-background-primary)',
      border: '1px solid var(--color-border-tertiary)',
      borderRadius: 14, padding: '16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => navigate(`/stock/${pos.ticker}`)}
              style={{ fontSize: 15, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--color-text-primary)' }}
            >
              {pos.ticker}
            </button>
            <span style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 10,
              background: meta.bg, color: meta.color,
            }}>{meta.label}</span>
            {retPct != null && (
              <span style={{ fontSize: 12, fontWeight: 600, color: retPct >= 0 ? '#1D9E75' : '#E24B4A' }}>
                {retPct >= 0 ? '+' : ''}{retPct.toFixed(1)}%
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 3 }}>
            {pos.name} · {new Date(pos.registeredAt).toLocaleDateString('ko-KR')} 등록
          </div>
        </div>
        <button
          onClick={() => onClose(pos.id)}
          style={{
            fontSize: 11, padding: '3px 10px', borderRadius: 8,
            border: '1px solid var(--color-border-secondary)',
            background: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer',
          }}
        >
          종료
        </button>
      </div>

      <div style={{ marginBottom: 10 }}>
        <span style={{ fontSize: 18, fontWeight: 600 }}>
          {cur != null ? fmtCur(pos.ticker, cur) : '—'}
        </span>
      </div>

      {/* 매수 */}
      <div style={{ marginBottom: 8 }}>
        <div style={{
          fontSize: 10, color: 'var(--color-text-secondary)', fontWeight: 600,
          letterSpacing: '0.05em', marginBottom: 5, textTransform: 'uppercase',
        }}>
          매수 {pos.entryType === 'split' ? '분할' : '일괄'}
        </div>
        {pos.entries.map((e, i) => {
          const dist = cur != null ? diffPct(cur, e.price) : null
          return (
            <Row key={i}
              label={pos.entryType === 'split' ? `${i + 1}차` : '진입가'}
              price={fmtCur(pos.ticker, e.price)}
              badge={pos.entryType === 'split' ? `${e.ratio}%` : undefined}
              right={dist == null ? undefined : dist <= 0 ? `✓ 진입 (${dist.toFixed(1)}%)` : `${dist.toFixed(1)}% 위`}
              rightColor={dist != null && dist <= 0 ? '#1D9E75' : undefined}
            />
          )
        })}
        <div style={{ height: '0.5px', background: 'var(--color-border-tertiary)', margin: '4px 0' }} />
        <Row
          label="손절선"
          price={fmtCur(pos.ticker, pos.stopLoss)}
          right={cur != null ? `${diffPct(cur, pos.stopLoss).toFixed(1)}%` : undefined}
          rightColor={cur != null && diffPct(cur, pos.stopLoss) < 0 ? '#E24B4A' : undefined}
        />
      </div>

      {/* 매도 */}
      <div style={{ marginBottom: 10 }}>
        <div style={{
          fontSize: 10, color: 'var(--color-text-secondary)', fontWeight: 600,
          letterSpacing: '0.05em', marginBottom: 5, textTransform: 'uppercase',
        }}>
          매도 목표
        </div>
        {pos.targets.map((t, i) => {
          const pct     = cur != null ? diffPct(cur, t.price) : 0
          const reached = cur != null && pct <= 0
          return (
            <BarRow key={i}
              label={`${i + 1}차 목표`}
              price={fmtCur(pos.ticker, t.price)}
              pct={pct}
              reached={reached}
            />
          )
        })}
      </div>

      {/* 보유 기간 가이드 */}
      {pos.holding && (() => {
        const { minWeeks, targetWeeks, maxWeeks } = pos.holding

        const status =
          elapsedW > maxWeeks     ? 'over'   :
          elapsedW > targetWeeks  ? 'review' :
          elapsedW >= minWeeks    ? 'normal' : 'watch'

        const statusLabel: Record<string, string> = {
          watch:  '관찰 중',
          normal: '정상',
          review: '재검토 필요',
          over:   '기간 초과',
        }
        const statusColor: Record<string, string> = {
          watch:  'var(--color-text-secondary)',
          normal: '#1DB87A',
          review: '#F5A623',
          over:   '#FF5A5A',
        }
        const barColor = statusColor[status]

        return (
          <div style={{
            borderTop: '0.5px solid var(--color-border-tertiary)',
            paddingTop: 10,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 6,
            }}>
              <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                보유 기간 가이드
              </span>
              <span style={{ fontSize: 11, color: barColor, fontWeight: 600 }}>
                {elapsed}일 경과 · {statusLabel[status]}
              </span>
            </div>

            {/* 진행 바 */}
            <div style={{ position: 'relative', height: 4, borderRadius: 2, background: 'var(--color-background-secondary)', marginBottom: 6 }}>
              <div style={{ height: '100%', borderRadius: 2, background: barColor, width: `${barWidth}%`, transition: 'width 0.6s ease' }} />
              {/* 마커: minWeeks */}
              <div style={{ position: 'absolute', top: -2, left: `${(minWeeks / maxWeeks) * 100}%`, width: 1, height: 8, background: '#404880' }} />
              {/* 마커: targetWeeks */}
              <div style={{ position: 'absolute', top: -2, left: `${(targetWeeks / maxWeeks) * 100}%`, width: 1, height: 8, background: '#7BA3FF' }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
              <span>최소 {minWeeks}주</span>
              <span style={{ color: '#7BA3FF' }}>권장 {targetWeeks}주</span>
              <span>최대 {maxWeeks}주</span>
            </div>

            <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
              <div>🛑 {pos.holding.stopCondition}</div>
              <div>🔄 {pos.holding.reviewCondition}</div>
            </div>
          </div>
        )
      })()}
    </div>
  )
})

// ─── 페이지 ───────────────────────────────────────────────────────
export default function PositionsPage() {
  const router   = useRouter()
  const navigate = useCallback((path: string) => router.push(path), [router])
  const { positions, prices, close: closePosition } = usePositions()

  const active = positions.filter(p => p.status === 'active')
  const closed = positions.filter(p => p.status === 'closed')

  return (
    <AuthGuard>
    <div style={{ minHeight: '100vh', background: 'var(--color-background-tertiary)', paddingBottom: 64, paddingTop: 48 }}>

      {/* 헤더 */}
      <header style={{
        background: 'var(--color-background-primary)',
        borderBottom: '1px solid var(--color-border-tertiary)',
        padding: '0 24px', height: 52,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: 'linear-gradient(135deg, #3B6EFF, #7B3BFF)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
          }}>📌</div>
          <span style={{ fontSize: 16, fontWeight: 700 }}>포지션 관리</span>
          <span style={{
            fontSize: 11, padding: '1px 8px', borderRadius: 10,
            background: 'var(--color-background-secondary)',
            color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-border-secondary)',
          }}>
            활성 {active.length} · 종료 {closed.length}
          </span>
        </div>
        <a
          href="/api/positions/notify"
          target="_blank"
          style={{ fontSize: 12, color: 'var(--color-text-secondary)', textDecoration: 'none' }}
        >
          Discord 알림 전송 →
        </a>
      </header>

      {/* 콘텐츠 */}
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 24px' }}>
        {positions.length === 0 ? (
          <div style={{
            padding: '60px 0', textAlign: 'center',
            color: 'var(--color-text-secondary)', fontSize: 13,
          }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📌</div>
            <div style={{ marginBottom: 6 }}>등록된 포지션이 없습니다</div>
            <div style={{ fontSize: 12 }}>종목 분석 후 "포지션 등록" 버튼을 눌러 전략을 고정하세요</div>
          </div>
        ) : (
          <>
            {active.length > 0 && (
              <>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--color-text-secondary)' }}>
                  활성 포지션
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
                  gap: 12, marginBottom: 28,
                }}>
                  {active.map(pos => (
                    <PositionCard
                      key={pos.id}
                      pos={pos}
                      cur={prices[pos.ticker] ?? null}
                      navigate={navigate}
                      onClose={closePosition}
                    />
                  ))}
                </div>
              </>
            )}

            {closed.length > 0 && (
              <>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--color-text-secondary)' }}>
                  종료된 포지션
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
                  gap: 12, opacity: 0.5,
                }}>
                  {closed.map(pos => (
                    <PositionCard
                      key={pos.id}
                      pos={pos}
                      cur={null}
                      navigate={navigate}
                      onClose={closePosition}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
    </AuthGuard>
  )
}
