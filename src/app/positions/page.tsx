'use client'

import { useEffect, useState, useCallback, memo } from 'react'
import { useRouter } from 'next/navigation'
import AuthGuard from '@/components/AuthGuard'
import PriceSpectrumBar from '@/components/PriceSpectrumBar'
import type { Position } from '@/types/stock'
import type { PriceData, ExtInfo } from '@/types/price'
import { useRefreshTick } from '@/hooks/useRefreshTick'

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
  const [prices,    setPrices]    = useState<Record<string, PriceData | null>>({})
  const tick = useRefreshTick()

  const load = useCallback(async () => {
    try {
      const r    = await fetch('/api/positions', { cache: 'no-store' })
      const data = await r.json()
      if (Array.isArray(data)) setPositions(data)
    } catch {}
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const active = positions.filter(p => p.status === 'active')
    if (!active.length) return
    const tickers = active.map(p => p.ticker).join(',')
    const doFetch = async () => {
      try {
        const r    = await fetch(`/api/prices?tickers=${tickers}`)
        const data = await r.json()
        setPrices(data)
      } catch {}
    }
    doFetch()
  }, [positions, tick])

  const close = useCallback(async (id: string) => {
    await fetch(`/api/positions?id=${id}`, { method: 'DELETE' })
    setPositions(prev => prev.map(p => p.id === id ? { ...p, status: 'closed' as const } : p))
  }, [])

  return { positions, prices, close, reload: load }
}

// ─── 포지션 카드 ──────────────────────────────────────────────────
const PositionCard = memo(function PositionCard({
  pos, cur, ext, navigate, onClose,
}: {
  pos: Position
  cur: number | null
  ext: ExtInfo | null
  navigate: (path: string) => void
  onClose: (id: string) => void
}) {
  const isKR     = IS_KR(pos.ticker)
  const meta     = SIGNAL_META[pos.signal] ?? SIGNAL_META.watch
  const avgEntry = pos.entries.reduce((s, e) => s + e.price * (e.ratio / 100), 0)
  const retPct   = cur != null && avgEntry > 0 ? diffPct(avgEntry, cur) : null

  const elapsed  = Math.max(0, Math.floor((Date.now() - new Date(pos.registeredAt).getTime()) / 86400000))
  const elapsedW = elapsed / 7
  const holdingBarPct = pos.holding ? Math.min(100, (elapsedW / pos.holding.maxWeeks) * 100) : 0
  const [holdingBarWidth, setHoldingBarWidth] = useState(0)
  useEffect(() => {
    const id = requestAnimationFrame(() => setHoldingBarWidth(holdingBarPct))
    return () => cancelAnimationFrame(id)
  }, [holdingBarPct])

  const sectionTitle: React.CSSProperties = {
    fontSize: 10, color: 'var(--color-text-secondary)', fontWeight: 600,
    letterSpacing: '0.05em', marginBottom: 8, textTransform: 'uppercase',
    paddingBottom: 5, borderBottom: '0.5px solid var(--color-border-tertiary)',
  }

  return (
    <div style={{
      background: 'var(--color-background-primary)',
      border: '1px solid var(--color-border-tertiary)',
      borderRadius: 14, padding: '16px',
    }}>
      {/* ── 헤더 ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => navigate(`/stock/${pos.ticker}?from=position`)}
              style={{ fontSize: 15, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--color-text-primary)' }}
            >
              {pos.ticker}
            </button>
            <span style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 10,
              background: meta.bg, color: meta.color,
            }}>{meta.label}</span>
            {retPct != null && (
              <span style={{ fontSize: 13, fontWeight: 700, color: retPct >= 0 ? 'var(--color-positive-dark)' : 'var(--color-negative-dark)' }}>
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

      {/* ── AI 요약 ── */}
      {pos.summary && (
        <p style={{
          fontSize: 12, lineHeight: 1.6, color: 'var(--color-text-secondary)',
          margin: '0 0 12px',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {pos.summary}
        </p>
      )}

      {/* ── 현재가 ── */}
      <div style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 20, fontWeight: 700 }}>
          {cur != null ? fmtCur(pos.ticker, cur) : '—'}
        </span>
        {ext && (
          <span style={{ marginLeft: 8, fontSize: 11, color: ext.change >= 0 ? 'var(--color-positive-dark)' : 'var(--color-negative-dark)' }}>
            {ext.type === 'pre' ? '장전' : '시간외'} {fmtCur(pos.ticker, ext.price)}{' '}
            {ext.changePct >= 0 ? '+' : ''}{ext.changePct.toFixed(2)}%
          </span>
        )}
      </div>

      {/* ── 가격 스펙트럼 바 ── */}
      {cur != null && (
        <PriceSpectrumBar
          stopLoss={pos.stopLoss}
          entries={pos.entries}
          currentPrice={cur}
          targets={pos.targets}
          isKR={isKR}
        />
      )}

      {/* ── 매수 ── */}
      <div style={{ marginBottom: 12 }}>
        <div style={sectionTitle}>매수 {pos.entryType === 'split' ? '분할' : '일괄'}</div>
        {pos.entries.map((e, i) => {
          const dist    = cur != null ? diffPct(cur, e.price) : null
          const entered = dist != null && dist <= 0
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 0', borderBottom: '0.5px solid var(--color-border-tertiary)',
            }}>
              <div style={{ width: 3, height: 30, borderRadius: 2, background: 'var(--color-positive-dark)', flexShrink: 0 }} />
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', flex: 1 }}>
                  {pos.entryType === 'split' ? `${i + 1}차` : '진입가'}
                  {pos.entryType === 'split' && (
                    <span style={{ marginLeft: 4, fontSize: 10, color: 'var(--color-text-secondary)' }}>{e.ratio}%</span>
                  )}
                </span>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {fmtCur(pos.ticker, e.price)}
                </span>
                {dist != null && (
                  <span style={{
                    fontSize: 10, padding: '2px 7px', borderRadius: 8, fontWeight: 700, whiteSpace: 'nowrap',
                    background: entered ? '#1D9E7520' : 'var(--color-background-secondary)',
                    color:      entered ? 'var(--color-positive-dark)'   : 'var(--color-text-secondary)',
                    border: `0.5px solid ${entered ? '#1D9E7540' : 'var(--color-border-secondary)'}`,
                  }}>
                    {entered ? `✓ 진입 (${dist.toFixed(1)}%)` : `대기 +${dist.toFixed(1)}%`}
                  </span>
                )}
              </div>
            </div>
          )
        })}

        {/* 손절 콜아웃 */}
        <div style={{
          padding: '9px 12px', borderRadius: 8, marginTop: 8,
          background: '#E24B4A08', border: '0.5px solid #E24B4A40',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-negative-dark)' }}>🛑 손절선</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-negative-dark)' }}>
                {fmtCur(pos.ticker, pos.stopLoss)}
              </span>
              {cur != null && (
                <span style={{ fontSize: 11, color: '#E24B4A99' }}>
                  {diffPct(cur, pos.stopLoss).toFixed(1)}%
                </span>
              )}
            </div>
          </div>
          {pos.stopLossReason && (
            <div style={{ fontSize: 10, color: '#E24B4A80', lineHeight: 1.4, marginTop: 3 }}>
              {pos.stopLossReason}
            </div>
          )}
        </div>
      </div>

      {/* ── 매도 목표 ── */}
      <div style={{ marginBottom: 12 }}>
        <div style={sectionTitle}>매도 목표</div>
        {pos.targets.map((t, i) => {
          const pct     = cur != null ? diffPct(cur, t.price) : 0
          const reached = cur != null && pct <= 0
          return (
            <div key={i} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <div style={{ width: 3, height: 24, borderRadius: 2, background: 'var(--color-caution)', flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', flex: 1 }}>{i + 1}차 목표</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {fmtCur(pos.ticker, t.price)}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
                  color: reached ? 'var(--color-positive-dark)' : 'var(--color-text-secondary)',
                }}>
                  {reached ? '✓ 달성' : cur != null ? `+${pct.toFixed(1)}% 남음` : ''}
                </span>
              </div>
              <div style={{ height: 3, borderRadius: 2, background: 'var(--color-background-secondary)', overflow: 'hidden', marginLeft: 13 }}>
                <div style={{
                  height: '100%', borderRadius: 2,
                  background: reached ? 'var(--color-positive-dark)' : 'var(--color-caution)',
                  width: `${Math.min(100, Math.max(0, 100 - pct))}%`,
                  transition: 'width .4s',
                }} />
              </div>
            </div>
          )
        })}
      </div>

      {/* ── 보유 기간 가이드 ── */}
      {pos.holding && (() => {
        const { minWeeks, targetWeeks, maxWeeks } = pos.holding

        const status =
          elapsedW > maxWeeks    ? 'over'   :
          elapsedW > targetWeeks ? 'review' :
          elapsedW >= minWeeks   ? 'normal' : 'watch'

        const statusLabel: Record<string, string> = {
          watch: '관찰 중', normal: '정상', review: '재검토 필요', over: '기간 초과',
        }
        const statusColor: Record<string, string> = {
          watch: 'var(--color-text-secondary)', normal: 'var(--color-positive-dark)', review: 'var(--color-caution)', over: 'var(--color-negative-dark)',
        }
        const barColor = statusColor[status]

        return (
          <div style={{ borderTop: '0.5px solid var(--color-border-tertiary)', paddingTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                보유 기간 가이드
              </span>
              <span style={{ fontSize: 11, color: barColor, fontWeight: 600 }}>
                {elapsed}일 경과 · {statusLabel[status]}
              </span>
            </div>

            <div style={{ position: 'relative', height: 4, borderRadius: 2, background: 'var(--color-background-secondary)', marginBottom: 6 }}>
              <div style={{ height: '100%', borderRadius: 2, background: barColor, width: `${holdingBarWidth}%`, transition: 'width 0.6s ease' }} />
              <div style={{ position: 'absolute', top: -2, left: `${(minWeeks / maxWeeks) * 100}%`, width: 1, height: 8, background: 'var(--color-border-primary)' }} />
              <div style={{ position: 'absolute', top: -2, left: `${(targetWeeks / maxWeeks) * 100}%`, width: 1, height: 8, background: 'var(--color-info-text)' }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
              <span>최소 {minWeeks}주</span>
              <span style={{ color: 'var(--color-info-text)' }}>권장 {targetWeeks}주</span>
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
                      cur={prices[pos.ticker]?.price ?? null}
                      ext={prices[pos.ticker]?.ext ?? null}
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
                      ext={null}
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
