'use client'
/**
 * MarketIndicesBar
 * 주요 지수(NASDAQ, S&P 500, VIX, USD/KRW)와 AI 시장 분석요약을 표시하는 컴포넌트.
 * VIX 수준과 NASDAQ 등락률을 조합해 시장 감성(우려·중립·낙관)을 규칙 기반으로 산정한다.
 */
import { useMemo, memo } from 'react'
import type { MarketData } from '@/types/market'
import SkeletonBox from '@/components/SkeletonBox'

const MARKET_CONFIG = [
  { symbol: '^IXIC',    label: 'NASDAQ',   fmt: (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 }), showChange: true  },
  { symbol: '^GSPC',    label: 'S&P 500',  fmt: (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 }), showChange: true  },
  { symbol: '^VIX',     label: 'VIX',      fmt: (v: number) => v.toFixed(2),                                            showChange: true  },
  { symbol: 'USDKRW=X', label: 'USD/KRW', fmt: (v: number) => v.toFixed(2) + '원',                                    showChange: false },
] as const

type MarketAnalysis = {
  sentiment: string; sentimentColor: string; sentimentBg: string
  vixLabel: string;  vixColor: string
  lines: string[]
}

function computeMarketAnalysis(market: MarketData | null): MarketAnalysis | null {
  const ndx = market?.['^IXIC']
  const spx = market?.['^GSPC']
  const vix = market?.['^VIX']
  if (!ndx || !spx || !vix) return null

  const vixVal = vix.price
  const { vixLabel, vixColor } =
    vixVal < 15 ? { vixLabel: '시장 안정', vixColor: '#4ADE80' }
    : vixVal < 20 ? { vixLabel: '보통',    vixColor: '#A3B4FF' }
    : vixVal < 25 ? { vixLabel: '주의',     vixColor: '#F5A623' }
    : vixVal < 30 ? { vixLabel: '고변동성', vixColor: '#FF8C42' }
    :               { vixLabel: '위험',     vixColor: '#FF5A5A' }

  const avgChg = (ndx.changePct + spx.changePct) / 2
  const { sentiment, sentimentColor, sentimentBg } =
    avgChg >  0.5 ? { sentiment: '상승세', sentimentColor: '#4ADE80', sentimentBg: '#4ADE8020' }
    : avgChg >  0 ? { sentiment: '약상승', sentimentColor: '#A3E4B0', sentimentBg: '#4ADE8015' }
    : avgChg > -0.5 ? { sentiment: '약하락', sentimentColor: '#FF9999', sentimentBg: '#FF5A5A15' }
    :               { sentiment: '하락세', sentimentColor: '#FF5A5A', sentimentBg: '#FF5A5A20' }

  const lines: string[] = [
    vixVal >= 25 ? `VIX ${vixVal.toFixed(1)} — 공포 지수 높음, 변동성 주의`
    : vixVal < 15 ? `VIX ${vixVal.toFixed(1)} — 시장 심리 안정적`
    : `VIX ${vixVal.toFixed(1)} — 변동성 보통`,

    Math.abs(ndx.changePct - spx.changePct) > 0.7
      ? 'NASDAQ·S&P 500 방향 엇갈림 (혼조)'
      : avgChg > 0 ? '주요 지수 동반 상승' : '주요 지수 동반 하락',
  ]

  return { sentiment, sentimentColor, sentimentBg, vixLabel, vixColor, lines }
}

const MarketSentimentCard = memo(function MarketSentimentCard({
  market,
}: {
  market: MarketData | null
}) {
  const result = useMemo(() => computeMarketAnalysis(market), [market])

  if (!result) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, #3B6EFF11, #7B3BFF11)',
        border: '1px solid #3B6EFF33',
        borderRadius: 10, padding: '8px 14px', minWidth: 180, flexShrink: 0,
        display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6,
      }}>
        <div style={{ fontSize: 11, color: 'var(--color-info-text)', marginBottom: 1 }}>✦ 시장 분석</div>
        <SkeletonBox height={12} width="70%" borderRadius={4} />
        <SkeletonBox height={11} width="90%" borderRadius={4} />
      </div>
    )
  }

  const { sentiment, sentimentColor, sentimentBg, vixLabel, vixColor, lines } = result
  return (
    <div style={{
      background: sentimentBg,
      border: `1px solid ${sentimentColor}33`,
      borderRadius: 10, padding: '8px 14px', minWidth: 200, flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
        <span style={{ fontSize: 11, color: 'var(--color-accent-muted)' }}>✦ 시장 분석</span>
        <span style={{
          fontSize: 11, padding: '1px 7px', borderRadius: 8, fontWeight: 700,
          background: sentimentColor + '22', color: sentimentColor,
          border: `0.5px solid ${sentimentColor}55`,
        }}>
          {sentiment}
        </span>
        <span style={{
          fontSize: 10, padding: '1px 6px', borderRadius: 8,
          background: vixColor + '22', color: vixColor,
          border: `0.5px solid ${vixColor}55`,
        }}>
          {vixLabel}
        </span>
      </div>
      {lines.map((line, i) => (
        <div key={i} style={{ fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
          {line}
        </div>
      ))}
    </div>
  )
})

export default function MarketIndicesBar({ market }: { market: MarketData | null }) {
  return (
    <div style={{
      background: 'var(--color-background-primary)',
      borderBottom: '1px solid var(--color-border-tertiary)',
      padding: '10px 24px',
      display: 'flex', gap: 8, overflowX: 'auto',
    }}>
      {MARKET_CONFIG.map(({ symbol, label, fmt, showChange }) => {
        const q            = market?.[symbol]
        const up           = q && q.changePct >= 0
        const chColor      = up ? 'var(--color-positive)' : 'var(--color-negative)'
        // [FIX 2] showChange: false 이더라도 changePct !== 0 이면 실제 등락 표시
        const displayChange = showChange || (q != null && q.changePct !== 0)
        return (
          <div key={symbol} style={{
            background: 'var(--color-background-secondary)',
            border: '1px solid var(--color-border-tertiary)',
            borderRadius: 10, padding: '8px 14px', minWidth: 118, flexShrink: 0,
          }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', minHeight: 22, display: 'flex', alignItems: 'center' }}>
              {q ? fmt(q.price) : <SkeletonBox height={14} width={80} borderRadius={4} />}
            </div>
            <div style={{ fontSize: 11, marginTop: 2, minHeight: 16, display: 'flex', alignItems: 'center' }}>
              {q == null
                ? <SkeletonBox height={10} width={56} borderRadius={4} />
                : displayChange
                  ? <span style={{ color: chColor }}>{up ? '+' : ''}{q.changePct.toFixed(2)}%</span>
                  : <span style={{ color: 'var(--color-text-secondary)' }}>실시간</span>
              }
            </div>
          </div>
        )
      })}
      <MarketSentimentCard market={market} />
    </div>
  )
}
