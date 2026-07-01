'use client'

import { useState } from 'react'
import type { StrategyResult, IndicatorSnapshot, HoldingGuide } from '@/types/stock'
import PriceSpectrumBar from './PriceSpectrumBar'

const SIGNAL_META = {
  strong_buy:  { label: '강력 매수', bg: '#E1F5EE', color: '#085041', border: 'var(--color-positive-dark)' },
  buy:         { label: '매수',      bg: '#EAF3DE', color: '#27500A', border: 'var(--color-positive-muted)' },
  watch:       { label: '관망',      bg: '#FAEEDA', color: '#633806', border: 'var(--color-caution)' },
  sell:        { label: '매도',      bg: '#FAECE7', color: '#712B13', border: '#D85A30' },
  strong_sell: { label: '강력 매도', bg: '#FCEBEB', color: '#791F1F', border: 'var(--color-negative-dark)' },
} as const

function SignalBadge({ signal }: { signal: StrategyResult['signal'] }) {
  const m = SIGNAL_META[signal]
  return (
    <span style={{
      display: 'inline-block', padding: '4px 14px', borderRadius: 20,
      fontSize: 13, fontWeight: 500,
      background: m.bg, color: m.color, border: `1px solid ${m.border}`,
    }}>
      {m.label}
    </span>
  )
}

function formatPrice(price: number, isKR: boolean): string {
  return isKR
    ? price.toLocaleString('ko-KR') + '원'
    : '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ─── Holding Guide ────────────────────────────────────────────────
function HoldingGuideSection({ holding }: { holding: HoldingGuide }) {
  const minPct    = (holding.minWeeks    / holding.maxWeeks) * 100
  const targetPct = (holding.targetWeeks / holding.maxWeeks) * 100

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)',
        marginBottom: 10, paddingBottom: 6, borderBottom: '0.5px solid var(--color-border-tertiary)',
      }}>
        보유 기간 가이드
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>최소 {holding.minWeeks}주</span>
          <span style={{ fontSize: 10, color: 'var(--color-positive-dark)', fontWeight: 600 }}>권장 {holding.targetWeeks}주</span>
          <span style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>최대 {holding.maxWeeks}주</span>
        </div>
        <div style={{ position: 'relative', height: 4, background: 'var(--color-background-secondary)', borderRadius: 2 }}>
          <div style={{
            position: 'absolute', left: `${minPct}%`,
            width: `${targetPct - minPct}%`, height: '100%',
            background: '#1D9E7540', borderRadius: 2,
          }} />
          <div style={{
            position: 'absolute', left: `${minPct}%`, transform: 'translateX(-50%)',
            width: 2, height: 8, top: -2, background: 'var(--color-text-secondary)',
          }} />
          <div style={{
            position: 'absolute', left: `${targetPct}%`, transform: 'translateX(-50%)',
            width: 2, height: 8, top: -2, background: 'var(--color-positive-dark)',
          }} />
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div><span style={{ color: 'var(--color-negative-dark)', fontWeight: 600 }}>손절 조건  </span>{holding.stopCondition}</div>
        <div><span style={{ color: 'var(--color-caution)', fontWeight: 600 }}>재검토 조건  </span>{holding.reviewCondition}</div>
      </div>
    </div>
  )
}

// ─── Price Row ────────────────────────────────────────────────────
function PriceRow({ label, price, ratio, reason, color, isKR }: {
  label: string; price: number; ratio?: number; reason: string; color: string; isKR: boolean
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '9px 0', borderBottom: '0.5px solid var(--color-border-tertiary)',
    }}>
      <div style={{ width: 3, minHeight: 34, borderRadius: 2, background: color, flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
          <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', flex: 1 }}>{label}</span>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {formatPrice(price, isKR)}
          </span>
          {ratio !== undefined && (
            <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{ratio}%</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{reason}</div>
      </div>
    </div>
  )
}

// ─── Snapshot Grid ────────────────────────────────────────────────
function SnapshotGrid({ snap, isKR }: { snap: IndicatorSnapshot; isKR: boolean }) {
  const items = [
    {
      label: 'RSI (14)', value: snap.rsi?.toFixed(1) ?? 'N/A',
      sub: snap.rsi == null ? '' : snap.rsi < 30 ? '과매도' : snap.rsi > 70 ? '과매수' : '중립',
      color: snap.rsi == null ? '' : snap.rsi < 30 ? 'var(--color-positive-dark)' : snap.rsi > 70 ? 'var(--color-negative-dark)' : 'var(--color-text-secondary)',
    },
    {
      label: 'MACD', value: snap.macd?.toFixed(2) ?? 'N/A',
      sub: snap.histogram == null ? '' : snap.histogram > 0 ? '양전환' : '음전환',
      color: snap.histogram == null ? '' : snap.histogram > 0 ? 'var(--color-positive-dark)' : 'var(--color-negative-dark)',
    },
    {
      label: '볼린저 위치',
      value: snap.bbPosition == null ? 'N/A' : `${(snap.bbPosition * 100).toFixed(0)}%`,
      sub: snap.bbPosition == null ? '' : snap.bbPosition < 0.2 ? '하단 근접' : snap.bbPosition > 0.8 ? '상단 근접' : '중간',
      color: 'var(--color-text-secondary)',
    },
    {
      label: 'MA 크로스',
      value: ({ golden: '골든', dead: '데드', neutral: '중립' } as Record<typeof snap.maCrossState, string>)[snap.maCrossState],
      sub: ({ golden: '5일>20일', dead: '5일<20일', neutral: '' } as Record<typeof snap.maCrossState, string>)[snap.maCrossState],
      color: snap.maCrossState === 'golden' ? 'var(--color-positive-dark)' : snap.maCrossState === 'dead' ? 'var(--color-negative-dark)' : 'var(--color-text-secondary)',
    },
    {
      label: '거래량 비율', value: `${snap.volumeRatio.toFixed(2)}x`,
      sub: snap.volumeRatio > 1.5 ? '급증' : snap.volumeRatio < 0.7 ? '급감' : '보통',
      color: snap.volumeRatio > 1.5 ? 'var(--color-positive-dark)' : 'var(--color-text-secondary)',
    },
    {
      label: '현재가', value: formatPrice(snap.close, isKR),
      sub: '', color: 'var(--color-text-primary)',
    },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 20 }}>
      {items.map(({ label, value, sub, color }) => (
        <div key={label} style={{ background: 'var(--color-background-secondary)', borderRadius: 8, padding: '8px 10px' }}>
          <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginBottom: 3 }}>{label}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: color || 'var(--color-text-primary)' }}>{value}</div>
          {sub && <div style={{ fontSize: 10, color, marginTop: 1 }}>{sub}</div>}
        </div>
      ))}
    </div>
  )
}

// ─── Section Title style ──────────────────────────────────────────
const sectionTitleStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600,
  color: 'var(--color-text-secondary)',
  marginBottom: 10, paddingBottom: 6,
  borderBottom: '0.5px solid var(--color-border-tertiary)',
  display: 'flex', alignItems: 'center', gap: 8,
}

// ─── Props ────────────────────────────────────────────────────────
interface Props {
  ticker: string
  name?: string
  strategy: StrategyResult | null
  snapshot: IndicatorSnapshot | null
  isLoading: boolean
  isFallback: boolean
  fromCache: boolean
  fromDB?: boolean
  onAnalyze: (entryPrice?: number) => void
  onForceRefresh: (entryPrice?: number) => void
}

export default function StrategyPanel({
  ticker, name, strategy, snapshot, isLoading, isFallback, fromCache, fromDB, onAnalyze, onForceRefresh,
}: Props) {
  const [showRaw,          setShowRaw]          = useState(false)
  const [registering,      setRegistering]      = useState(false)
  const [registerState,    setRegisterState]    = useState<'idle' | 'ok' | 'ok_updated' | 'err'>('idle')
  const [confirmOverwrite, setConfirmOverwrite] = useState<{ id: string; registeredAt: string } | null>(null)
  const [entryPriceInput,  setEntryPriceInput]  = useState('')
  const isKR = /^\d{6}$/.test(ticker)

  // 빈 문자열 → undefined(미입력), 유효 양수 → number, 그 외 → NaN
  const parsedEntryPrice: number | undefined = (() => {
    const raw = entryPriceInput.trim()
    if (raw === '') return undefined
    const cleaned = raw.replace(/,/g, '')
    if (!/^\d+(\.\d+)?$/.test(cleaned)) return NaN  // 문자·특수문자·복수 소수점
    const n = +cleaned
    return n > 0 ? n : NaN                           // 0 또는 음수 불가
  })()
  const entryPriceInvalid = entryPriceInput.trim() !== '' && (parsedEntryPrice === undefined || isNaN(parsedEntryPrice as number))

  const finishWith = (state: typeof registerState) => {
    setRegisterState(state)
    setRegistering(false)
    setTimeout(() => setRegisterState('idle'), 3000)
  }

  const handleRegister = async () => {
    if (!strategy) return
    setRegistering(true)
    setRegisterState('idle')
    try {
      let all: Array<{ ticker: string; id: string; registeredAt: string; status: string }> = []
      try {
        const r = await fetch('/api/positions')
        all     = await r.json()
      } catch {}
      const existing = all.find(p => p.ticker === ticker.toUpperCase() && p.status === 'active')

      if (existing) {
        setConfirmOverwrite({ id: existing.id, registeredAt: existing.registeredAt })
        setRegistering(false)
        return
      }

      const res = await fetch('/api/positions', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ticker, name: name ?? ticker, strategy }),
      })
      finishWith(res.ok ? 'ok' : 'err')
    } catch {
      finishWith('err')
    }
  }

  const handleConfirmOverwrite = async () => {
    if (!confirmOverwrite || !strategy) return
    setConfirmOverwrite(null)
    setRegistering(true)
    try {
      const res = await fetch('/api/positions', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id: confirmOverwrite.id, strategy }),
      })
      finishWith(res.ok ? 'ok_updated' : 'err')
    } catch {
      finishWith('err')
    }
  }

  return (
    <div style={{
      background: 'var(--color-background-primary)',
      border: '0.5px solid var(--color-border-tertiary)',
      borderRadius: 12, padding: '20px', height: '100%',
    }}>
      {/* 헤더 */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)' }}>{ticker}</span>
              {name && <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{name}</span>}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>AI 매매 전략 · Gemini 분석</div>
          </div>
          <button
            onClick={() => onAnalyze(parsedEntryPrice)}
            disabled={isLoading}
            style={{
              padding: '8px 16px', borderRadius: 8,
              border: '0.5px solid var(--color-border-secondary)',
              background: isLoading ? 'var(--color-background-secondary)' : 'var(--color-text-primary)',
              color: isLoading ? 'var(--color-text-secondary)' : 'var(--color-background-primary)',
              fontSize: 13, cursor: isLoading ? 'not-allowed' : 'pointer', transition: 'all .15s',
            }}
          >
            {isLoading ? '분석 중…' : '전략 분석'}
          </button>
        </div>
        {/* 진입가 입력 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 11, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
            진입가 (선택)
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={entryPriceInput}
            onChange={e => setEntryPriceInput(e.target.value)}
            placeholder={isKR ? '예: 75000' : '예: 185.50'}
            style={{
              flex: 1, padding: '5px 10px', borderRadius: 6,
              border: `0.5px solid ${entryPriceInvalid ? 'var(--color-error-border)' : 'var(--color-border-secondary)'}`,
              background: 'var(--color-background-secondary)',
              color: entryPriceInvalid ? 'var(--color-error-text)' : 'var(--color-text-primary)',
              fontSize: 12, outline: 'none',
            }}
          />
          {entryPriceInvalid && (
            <span style={{ fontSize: 10, color: 'var(--color-error-text)', whiteSpace: 'nowrap' }}>
              숫자만 입력
            </span>
          )}
          {!entryPriceInvalid && typeof parsedEntryPrice === 'number' && snapshot?.close != null && (
            <span style={{
              fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
              color: snapshot.close >= parsedEntryPrice
                ? 'var(--color-success-text, #1D9E75)'
                : 'var(--color-error-text, #D85A30)',
            }}>
              {((snapshot.close - parsedEntryPrice) / parsedEntryPrice * 100).toFixed(2)}%
            </span>
          )}
        </div>
      </div>

      {/* 로딩 */}
      {isLoading && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-text-secondary)', fontSize: 13 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            border: '2px solid var(--color-border-secondary)',
            borderTopColor: 'var(--color-text-primary)',
            animation: 'spin 0.7s linear infinite',
            margin: '0 auto 12px',
          }} />
          <div style={{ marginBottom: 4 }}>지표 계산 + Gemini AI 분석 중</div>
          <div style={{ fontSize: 11 }}>약 5~10초 소요됩니다</div>
        </div>
      )}

      {/* 결과 없음 */}
      {!isLoading && !strategy && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--color-text-secondary)', fontSize: 13 }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>📊</div>
          <div style={{ marginBottom: 6 }}>전략 분석 버튼을 눌러</div>
          <div>AI 매매 전략을 생성하세요</div>
        </div>
      )}

      {/* 분석 결과 */}
      {!isLoading && strategy && snapshot && (
        <>
          {/* 폴백 알림 */}
          {isFallback && (
            <div style={{
              padding: '8px 12px', marginBottom: 12,
              background: 'var(--color-warning-bg)', border: '0.5px solid var(--color-warning-border)',
              borderRadius: 8, fontSize: 12, color: 'var(--color-warning-text)',
            }}>
              Gemini API 미연결 — 규칙 기반 자동 분석 결과입니다
            </div>
          )}

          {/* 시그널 + 배지 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <SignalBadge signal={strategy.signal} />
            <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
              {new Date(strategy.generatedAt).toLocaleString('ko-KR')}
            </span>
            {fromDB && (
              <span style={{
                fontSize: 11, padding: '1px 7px', borderRadius: 10,
                background: '#E8F5E9', color: '#2E7D32', border: '0.5px solid #81C784',
              }}>
                포지션 등록 전략
              </span>
            )}
            {fromCache && !fromDB && (
              <span style={{
                fontSize: 11, padding: '1px 7px', borderRadius: 10,
                background: '#EEF0F8', color: '#4B5DA0', border: '0.5px solid #9BAAD4',
              }}>
                캐시됨
              </span>
            )}
            {(fromCache || fromDB) && (
              <button
                onClick={() => onForceRefresh(parsedEntryPrice)}
                disabled={isLoading}
                style={{
                  fontSize: 11, padding: '1px 8px', borderRadius: 10,
                  background: 'none', border: '0.5px solid var(--color-border-secondary)',
                  color: 'var(--color-text-secondary)', cursor: 'pointer',
                }}
              >
                새로고침
              </button>
            )}
          </div>

          {/* 요약 */}
          <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--color-text-primary)', margin: '0 0 16px' }}>
            {strategy.summary}
          </p>

          {/* 가격 스펙트럼 바 */}
          <PriceSpectrumBar
            stopLoss={strategy.buyStrategy.stopLoss}
            entries={strategy.buyStrategy.entries}
            currentPrice={snapshot.close}
            targets={strategy.sellStrategy.targets}
            isKR={isKR}
          />

          {/* 지표 스냅샷 */}
          <SnapshotGrid snap={snapshot} isKR={isKR} />

          {/* 매수 전략 */}
          <div style={{ marginBottom: 16 }}>
            <div style={sectionTitleStyle}>
              <span>매수 전략</span>
              <span style={{
                fontSize: 10, padding: '1px 7px', borderRadius: 10, fontWeight: 500,
                background: strategy.buyStrategy.type === 'split' ? '#E1F5EE' : '#EAF3DE',
                color: strategy.buyStrategy.type === 'split' ? '#085041' : '#27500A',
              }}>
                {strategy.buyStrategy.type === 'split' ? '분할 매수' : '일괄 매수'}
              </span>
            </div>
            {strategy.buyStrategy.entries.map((entry, i) => (
              <PriceRow
                key={i}
                label={strategy.buyStrategy.type === 'split' ? `${i + 1}차 매수` : '진입가'}
                price={entry.price} ratio={entry.ratio} reason={entry.reason}
                color="#1D9E75" isKR={isKR}
              />
            ))}

            {/* 손절 콜아웃 */}
            <div style={{
              padding: '10px 12px', borderRadius: 8, marginTop: 10,
              background: '#E24B4A08', border: '0.5px solid #E24B4A40',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-negative-dark)' }}>🛑 손절선</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-negative-dark)' }}>
                  {formatPrice(strategy.buyStrategy.stopLoss, isKR)}
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#E24B4A99', lineHeight: 1.5 }}>
                {strategy.buyStrategy.stopLossReason}
              </div>
            </div>
          </div>

          {/* 매도 전략 */}
          <div style={{ marginBottom: 16 }}>
            <div style={sectionTitleStyle}>매도 전략</div>
            {strategy.sellStrategy.targets.map((target, i) => (
              <PriceRow
                key={i}
                label={`${i + 1}차 목표`}
                price={target.price} ratio={target.ratio} reason={target.reason}
                color="#E24B4A" isKR={isKR}
              />
            ))}
          </div>

          {/* 주요 리스크 */}
          <div style={{ marginBottom: 16 }}>
            <div style={sectionTitleStyle}>주요 리스크</div>
            {strategy.risks.map((risk, i) => (
              <div key={i} style={{
                display: 'flex', gap: 8, marginBottom: 6,
                fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5,
              }}>
                <span style={{ color: 'var(--color-caution)', flexShrink: 0 }}>▪</span>
                {risk}
              </div>
            ))}
          </div>

          {/* 보유 기간 가이드 */}
          {strategy.holding && (
            <HoldingGuideSection holding={strategy.holding} />
          )}

          {/* 포지션 등록 */}
          <div style={{ marginBottom: 14 }}>
            {confirmOverwrite ? (
              <div style={{
                borderRadius: 8, border: '1px solid #EF9F2755',
                background: '#EF9F2710', padding: '12px 14px',
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-caution)', marginBottom: 4 }}>
                  ⚠ 이미 등록된 포지션이 있습니다
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
                  등록일 {new Date(confirmOverwrite.registeredAt).toLocaleString('ko-KR', {
                    year: 'numeric', month: 'numeric', day: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })} · 최신화하면 기존 전략이 현재 전략으로 교체됩니다
                </div>
                <div style={{ display: 'flex', gap: 7 }}>
                  <button
                    onClick={() => setConfirmOverwrite(null)}
                    style={{
                      flex: 1, padding: '7px 0', borderRadius: 7,
                      border: '1px solid var(--color-border-secondary)',
                      background: 'var(--color-background-secondary)',
                      color: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    취소
                  </button>
                  <button
                    onClick={handleConfirmOverwrite}
                    style={{
                      flex: 1, padding: '7px 0', borderRadius: 7, border: 'none',
                      background: 'var(--color-caution)', color: '#fff', fontSize: 12, fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    최신화
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={handleRegister}
                disabled={registering || registerState === 'ok' || registerState === 'ok_updated'}
                style={{
                  width: '100%', padding: '9px 0', borderRadius: 8, border: 'none',
                  background: registerState === 'ok' || registerState === 'ok_updated' ? 'var(--color-positive-dark)'
                            : registerState === 'err' ? 'var(--color-negative-dark)'
                            : 'var(--color-accent-primary)',
                  color: '#fff', fontSize: 13, fontWeight: 600,
                  cursor: registering || registerState === 'ok' || registerState === 'ok_updated' ? 'default' : 'pointer',
                  transition: 'background .2s',
                }}
              >
                {registering                     ? '확인 중…'
                 : registerState === 'ok'         ? '✓ 포지션 등록 완료'
                 : registerState === 'ok_updated' ? '✓ 포지션 최신화 완료'
                 : registerState === 'err'        ? '⚠ 실패 — 재시도'
                 : '📌 포지션 등록'}
              </button>
            )}
            {(registerState === 'ok' || registerState === 'ok_updated') && (
              <div style={{ fontSize: 11, color: 'var(--color-positive-dark)', marginTop: 5, textAlign: 'center' }}>
                {registerState === 'ok_updated'
                  ? '기존 포지션이 현재 전략으로 최신화되었습니다'
                  : '메인 페이지 포지션 섹션에서 진행 상황을 확인하세요'}
              </div>
            )}
          </div>

          {/* 원문 토글 */}
          <button
            onClick={() => setShowRaw(!showRaw)}
            style={{
              fontSize: 11, color: 'var(--color-text-secondary)',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline',
            }}
          >
            {showRaw ? 'AI 응답 원문 숨기기' : 'AI 응답 원문 보기'}
          </button>

          {showRaw && (
            <pre style={{
              marginTop: 8, fontSize: 11, color: 'var(--color-text-secondary)',
              background: 'var(--color-background-secondary)', borderRadius: 6,
              padding: 10, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              maxHeight: 200, overflowY: 'auto',
            }}>
              {strategy.rawText}
            </pre>
          )}
        </>
      )}
    </div>
  )
}
