'use client'
/**
 * StockChart
 * 120일 OHLCV 봉 데이터와 기술적 지표(RSI, MACD, 볼린저밴드, 이동평균선, 거래량)를
 * Recharts 기반의 복합 차트로 렌더링하는 컴포넌트.
 * 탭(가격/RSI/MACD/볼린저)으로 차트 종류를 전환하며,
 * 전략 패널에서 내려준 매수·매도·손절 레벨을 ReferenceLine으로 오버레이한다.
 */

import { useState, useMemo } from 'react'
import {
  ComposedChart, Line, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Legend,
} from 'recharts'
import type { OHLCVBar, Indicators } from '@/types/stock'

// ─── 타입 ──────────────────────────────────────────────────────
interface Props {
  bars: OHLCVBar[]
  indicators: Indicators
  buyEntries?: { price: number; label: string }[]   // 전략 패널에서 내려줌
  sellTargets?: { price: number; label: string }[]
  stopLoss?: number
}

type TabKey = 'price' | 'rsi' | 'macd' | 'bollinger'

// ─── 캔들 커스텀 Bar ─────────────────────────────────────────────
// Recharts에는 캔들 차트가 없어서 Bar shape으로 직접 구현
const CandleBar = (props: any) => {
  const { x, y, width, payload } = props
  if (!payload) return null

  const { open, close, high, low } = payload
  const isUp = close >= open
  const color = isUp ? '#E24B4A' : '#378ADD'   // 한국: 빨강=상승, 파랑=하락

  // 차트 내 좌표로 변환하기 위한 yAxis scale은 props.yAxis에 있음
  const yScale = props.yAxis?.scale
  if (!yScale) return null

  const yOpen  = yScale(open)
  const yClose = yScale(close)
  const yHigh  = yScale(high)
  const yLow   = yScale(low)

  const bodyTop    = Math.min(yOpen, yClose)
  const bodyHeight = Math.max(Math.abs(yOpen - yClose), 1)
  const cx         = x + width / 2

  return (
    <g>
      {/* 위꼬리 */}
      <line x1={cx} y1={yHigh} x2={cx} y2={bodyTop} stroke={color} strokeWidth={1} />
      {/* 몸통 */}
      <rect x={x + 1} y={bodyTop} width={width - 2} height={bodyHeight} fill={color} />
      {/* 아래꼬리 */}
      <line x1={cx} y1={bodyTop + bodyHeight} x2={cx} y2={yLow} stroke={color} strokeWidth={1} />
    </g>
  )
}

// ─── 툴팁 ────────────────────────────────────────────────────────
const PriceTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <div style={{
      background: 'var(--color-background-primary)',
      border: '0.5px solid var(--color-border-secondary)',
      borderRadius: 8,
      padding: '8px 12px',
      fontSize: 12,
      color: 'var(--color-text-primary)',
    }}>
      <div style={{ color: 'var(--color-text-secondary)', marginBottom: 4 }}>{label}</div>
      <div>시가 <b>{d.open?.toLocaleString()}</b></div>
      <div>고가 <b style={{ color: '#E24B4A' }}>{d.high?.toLocaleString()}</b></div>
      <div>저가 <b style={{ color: '#378ADD' }}>{d.low?.toLocaleString()}</b></div>
      <div>종가 <b>{d.close?.toLocaleString()}</b></div>
      <div style={{ color: 'var(--color-text-secondary)', marginTop: 4 }}>
        거래량 {d.volume?.toLocaleString()}
      </div>
    </div>
  )
}

// ─── 탭 버튼 ─────────────────────────────────────────────────────
const TabButton = ({
  active, label, onClick,
}: { active: boolean; label: string; onClick: () => void }) => (
  <button
    onClick={onClick}
    style={{
      padding: '5px 14px',
      border: '0.5px solid var(--color-border-secondary)',
      borderRadius: 20,
      fontSize: 13,
      cursor: 'pointer',
      background: active ? 'var(--color-text-primary)' : 'transparent',
      color: active ? 'var(--color-background-primary)' : 'var(--color-text-secondary)',
      transition: 'all .15s',
    }}
  >
    {label}
  </button>
)

// ─── 메인 컴포넌트 ───────────────────────────────────────────────
export default function StockChart({
  bars,
  indicators,
  buyEntries = [],
  sellTargets = [],
  stopLoss,
}: Props) {
  const [tab, setTab] = useState<TabKey>('price')
  const [range, setRange] = useState<30 | 60 | 90>(60)

  // 표시 범위 슬라이싱
  const slicedBars = useMemo(() => bars.slice(-range), [bars, range])

  // Recharts용 데이터 병합
  const chartData = useMemo(() => {
    const offset = bars.length - slicedBars.length
    return slicedBars.map((b, i) => {
      const idx = offset + i
      return {
        ...b,
        dateShort: b.date.slice(5),   // "MM-DD"
        rsi:        indicators.rsi[idx] ?? null,
        macdLine:   indicators.macd.macdLine[idx] ?? null,
        signalLine: indicators.macd.signalLine[idx] ?? null,
        histogram:  indicators.macd.histogram[idx] ?? null,
        bbUpper:    indicators.bollinger.upper[idx] ?? null,
        bbMid:      indicators.bollinger.mid[idx] ?? null,
        bbLower:    indicators.bollinger.lower[idx] ?? null,
        ma5:        indicators.ma.ma5[idx] ?? null,
        ma20:       indicators.ma.ma20[idx] ?? null,
        ma60:       indicators.ma.ma60[idx] ?? null,
      }
    })
  }, [slicedBars, indicators, bars.length])

  const tickCount = range === 30 ? 6 : range === 60 ? 8 : 10

  return (
    <div style={{ width: '100%' }}>
      {/* 탭 + 범위 선택 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['price', 'bollinger', 'rsi', 'macd'] as TabKey[]).map((t) => (
            <TabButton
              key={t}
              active={tab === t}
              label={{ price: '주가', bollinger: '볼린저', rsi: 'RSI', macd: 'MACD' }[t]}
              onClick={() => setTab(t)}
            />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {([30, 60, 90] as const).map((r) => (
            <TabButton key={r} active={range === r} label={`${r}일`} onClick={() => setRange(r)} />
          ))}
        </div>
      </div>

      {/* ── 주가 + 거래량 차트 ── */}
      {(tab === 'price') && (
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,.12)" />
            <XAxis dataKey="dateShort" tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }} interval={Math.floor(range / tickCount)} />
            <YAxis yAxisId="price" domain={['auto', 'auto']} tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }} tickFormatter={(v) => v.toLocaleString()} width={70} />
            <YAxis yAxisId="volume" orientation="right" hide />
            <Tooltip content={<PriceTooltip />} />

            {/* 거래량 */}
            <Bar yAxisId="volume" dataKey="volume" fill="rgba(128,128,128,.2)" barSize={3} />

            {/* 이동평균선 */}
            <Line yAxisId="price" type="monotone" dataKey="ma5" stroke="#EF9F27" strokeWidth={1} dot={false} name="MA5" connectNulls />
            <Line yAxisId="price" type="monotone" dataKey="ma20" stroke="#E24B4A" strokeWidth={1.5} dot={false} name="MA20" connectNulls />
            <Line yAxisId="price" type="monotone" dataKey="ma60" stroke="#1D9E75" strokeWidth={1.5} dot={false} name="MA60" connectNulls />

            {/* 종가 라인 (캔들 대신) */}
            <Line yAxisId="price" type="monotone" dataKey="close" stroke="#378ADD" strokeWidth={2} dot={false} name="종가" />

            {/* 전략 라인 */}
            {buyEntries.map((e, i) => (
              <ReferenceLine key={`buy-${i}`} yAxisId="price" y={e.price}
                stroke="#1D9E75" strokeDasharray="6 3" strokeWidth={1.5}
                label={{ value: e.label, position: 'insideTopLeft', fontSize: 11, fill: '#1D9E75' }} />
            ))}
            {sellTargets.map((t, i) => (
              <ReferenceLine key={`sell-${i}`} yAxisId="price" y={t.price}
                stroke="#E24B4A" strokeDasharray="6 3" strokeWidth={1.5}
                label={{ value: t.label, position: 'insideTopLeft', fontSize: 11, fill: '#E24B4A' }} />
            ))}
            {stopLoss && (
              <ReferenceLine yAxisId="price" y={stopLoss}
                stroke="#888780" strokeDasharray="4 4" strokeWidth={1}
                label={{ value: '손절', position: 'insideTopLeft', fontSize: 11, fill: '#888780' }} />
            )}

            <Legend wrapperStyle={{ fontSize: 12, color: 'var(--color-text-secondary)' }} />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {/* ── 볼린저 밴드 ── */}
      {tab === 'bollinger' && (
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,.12)" />
            <XAxis dataKey="dateShort" tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }} interval={Math.floor(range / tickCount)} />
            <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }} tickFormatter={(v) => v.toLocaleString()} width={70} />
            <Tooltip formatter={(v: any) => v?.toLocaleString()} />
            <Line type="monotone" dataKey="bbUpper" stroke="#EF9F27" strokeWidth={1} strokeDasharray="4 3" dot={false} name="상단" connectNulls />
            <Line type="monotone" dataKey="bbMid"   stroke="#EF9F27" strokeWidth={1.5} dot={false} name="중심(20MA)" connectNulls />
            <Line type="monotone" dataKey="bbLower" stroke="#EF9F27" strokeWidth={1} strokeDasharray="4 3" dot={false} name="하단" connectNulls />
            <Line type="monotone" dataKey="close"   stroke="#378ADD" strokeWidth={2} dot={false} name="종가" />
            <Legend wrapperStyle={{ fontSize: 12 }} />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {/* ── RSI ── */}
      {tab === 'rsi' && (
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,.12)" />
            <XAxis dataKey="dateShort" tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }} interval={Math.floor(range / tickCount)} />
            <YAxis domain={[0, 100]} ticks={[0, 30, 50, 70, 100]} tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }} width={35} />
            <Tooltip formatter={(v: any) => v?.toFixed(1)} />
            <ReferenceLine y={70} stroke="#E24B4A" strokeDasharray="4 3" strokeWidth={1} label={{ value: '과매수 70', fontSize: 11, fill: '#E24B4A', position: 'insideTopLeft' }} />
            <ReferenceLine y={30} stroke="#378ADD" strokeDasharray="4 3" strokeWidth={1} label={{ value: '과매도 30', fontSize: 11, fill: '#378ADD', position: 'insideBottomLeft' }} />
            <ReferenceLine y={50} stroke="rgba(128,128,128,.3)" strokeWidth={0.5} />
            <Line type="monotone" dataKey="rsi" stroke="#534AB7" strokeWidth={2} dot={false} name="RSI(14)" connectNulls />
            <Legend wrapperStyle={{ fontSize: 12 }} />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {/* ── MACD ── */}
      {tab === 'macd' && (
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,.12)" />
            <XAxis dataKey="dateShort" tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }} interval={Math.floor(range / tickCount)} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }} width={50} />
            <Tooltip formatter={(v: any) => v?.toFixed(2)} />
            <ReferenceLine y={0} stroke="rgba(128,128,128,.4)" strokeWidth={0.5} />
            <Bar dataKey="histogram" name="히스토그램"
              fill="#378ADD"
              // 양수/음수 색상 분리는 Cell로 처리
            />
            <Line type="monotone" dataKey="macdLine"   stroke="#1D9E75" strokeWidth={2} dot={false} name="MACD" connectNulls />
            <Line type="monotone" dataKey="signalLine" stroke="#E24B4A" strokeWidth={1.5} strokeDasharray="4 2" dot={false} name="시그널" connectNulls />
            <Legend wrapperStyle={{ fontSize: 12 }} />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
