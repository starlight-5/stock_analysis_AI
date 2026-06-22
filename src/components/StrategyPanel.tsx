'use client'

import { useState } from 'react'
import type { StrategyResult, IndicatorSnapshot } from '@/types/stock'

const SIGNAL_META = {
  strong_buy:  { label: '강력 매수', bg: '#E1F5EE', color: '#085041', border: '#1D9E75' },
  buy:         { label: '매수',      bg: '#EAF3DE', color: '#27500A', border: '#639922' },
  watch:       { label: '관망',      bg: '#FAEEDA', color: '#633806', border: '#EF9F27' },
  sell:        { label: '매도',      bg: '#FAECE7', color: '#712B13', border: '#D85A30' },
  strong_sell: { label: '강력 매도', bg: '#FCEBEB', color: '#791F1F', border: '#E24B4A' },
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

function PriceRow({ label, price, ratio, reason, color }: {
  label: string; price: number; ratio?: number; reason: string; color: string
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: '10px 0', borderBottom: '0.5px solid var(--color-border-tertiary)',
    }}>
      <div style={{ minWidth: 60, fontSize: 11, fontWeight: 500, color, paddingTop: 2 }}>
        {label}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--color-text-primary)' }}>
            {price.toLocaleString('ko-KR')}원
          </span>
          {ratio !== undefined && (
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{ratio}% 비중</span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>{reason}</div>
      </div>
    </div>
  )
}

function SnapshotGrid({ snap }: { snap: IndicatorSnapshot }) {
  const items = [
    {
      label: 'RSI (14)', value: snap.rsi?.toFixed(1) ?? 'N/A',
      sub: snap.rsi == null ? '' : snap.rsi < 30 ? '과매도' : snap.rsi > 70 ? '과매수' : '중립',
      color: snap.rsi == null ? '' : snap.rsi < 30 ? '#1D9E75' : snap.rsi > 70 ? '#E24B4A' : 'var(--color-text-secondary)',
    },
    {
      label: 'MACD', value: snap.macd?.toFixed(2) ?? 'N/A',
      sub: snap.histogram == null ? '' : snap.histogram > 0 ? '양전환' : '음전환',
      color: snap.histogram == null ? '' : snap.histogram > 0 ? '#1D9E75' : '#E24B4A',
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
      color: snap.maCrossState === 'golden' ? '#1D9E75' : snap.maCrossState === 'dead' ? '#E24B4A' : 'var(--color-text-secondary)',
    },
    {
      label: '거래량 비율', value: `${snap.volumeRatio.toFixed(2)}x`,
      sub: snap.volumeRatio > 1.5 ? '급증' : snap.volumeRatio < 0.7 ? '급감' : '보통',
      color: snap.volumeRatio > 1.5 ? '#1D9E75' : 'var(--color-text-secondary)',
    },
    {
      label: '현재가', value: `${snap.close.toLocaleString()}원`,
      sub: '', color: 'var(--color-text-primary)',
    },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 20 }}>
      {items.map(({ label, value, sub, color }) => (
        <div key={label} style={{ background: 'var(--color-background-secondary)', borderRadius: 8, padding: '8px 10px' }}>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 3 }}>{label}</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: color || 'var(--color-text-primary)' }}>{value}</div>
          {sub && <div style={{ fontSize: 11, color, marginTop: 1 }}>{sub}</div>}
        </div>
      ))}
    </div>
  )
}

interface Props {
  ticker: string
  strategy: StrategyResult | null
  snapshot: IndicatorSnapshot | null
  isLoading: boolean
  isFallback: boolean
  fromCache: boolean
  onAnalyze: () => void
  onForceRefresh: () => void
}

export default function StrategyPanel({ ticker, strategy, snapshot, isLoading, isFallback, fromCache, onAnalyze, onForceRefresh }: Props) {
  const [showRaw, setShowRaw] = useState(false)

  return (
    <div style={{
      background: 'var(--color-background-primary)',
      border: '0.5px solid var(--color-border-tertiary)',
      borderRadius: 12, padding: '20px', height: '100%',
    }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>AI 매매 전략</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>Gemini AI 분석</div>
        </div>
        <button
          onClick={onAnalyze}
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
          {/* 폴백 모드 알림 */}
          {isFallback && (
            <div style={{
              padding: '8px 12px', marginBottom: 12,
              background: 'var(--color-warning-bg)', border: '0.5px solid var(--color-warning-border)',
              borderRadius: 8, fontSize: 12, color: 'var(--color-warning-text)',
            }}>
              Gemini API 미연결 — 규칙 기반 자동 분석 결과입니다
            </div>
          )}

          {/* 시그널 + 요약 */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <SignalBadge signal={strategy.signal} />
              <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                {new Date(strategy.generatedAt).toLocaleString('ko-KR')}
              </span>
              {fromCache && (
                <span style={{
                  fontSize: 11, padding: '1px 7px', borderRadius: 10,
                  background: '#EEF0F8', color: '#4B5DA0',
                  border: '0.5px solid #9BAAD4',
                }}>
                  캐시됨
                </span>
              )}
              {fromCache && (
                <button
                  onClick={onForceRefresh}
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
            <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--color-text-primary)', margin: 0 }}>
              {strategy.summary}
            </p>
          </div>

          {/* 지표 스냅샷 */}
          <SnapshotGrid snap={snapshot} />

          {/* 매수 전략 */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>매수 전략</span>
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 10,
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
                color="#1D9E75"
              />
            ))}
            <PriceRow
              label="손절선"
              price={strategy.buyStrategy.stopLoss}
              reason={strategy.buyStrategy.stopLossReason}
              color="#888780"
            />
          </div>

          {/* 매도 전략 */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>매도 전략</div>
            {strategy.sellStrategy.targets.map((target, i) => (
              <PriceRow
                key={i}
                label={`${i + 1}차 목표`}
                price={target.price} ratio={target.ratio} reason={target.reason}
                color="#E24B4A"
              />
            ))}
          </div>

          {/* 리스크 */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>주요 리스크</div>
            {strategy.risks.map((risk, i) => (
              <div key={i} style={{
                display: 'flex', gap: 8, marginBottom: 6,
                fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5,
              }}>
                <span style={{ color: '#EF9F27', flexShrink: 0 }}>▪</span>
                {risk}
              </div>
            ))}
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
