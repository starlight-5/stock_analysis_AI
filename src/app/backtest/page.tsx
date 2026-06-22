'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'

// ─── 타입 ────────────────────────────────────────────────────────────────────
interface Trade {
  entryDate: string
  entryPrice: number
  exitDate: string
  exitPrice: number
  returnPct: number
  profitLoss: number
  holdingDays: number
}

interface DailyPoint {
  date: string
  strategyValue: number
  buyHoldValue: number
  signal: string
  close: number
  action: 'buy' | 'sell' | null
}

interface BacktestResult {
  ticker: string
  period: { start: string; end: string; tradingDays: number }
  initialCapital: number
  txCostPct: number
  strategy: {
    finalCapital: number
    totalReturn: number
    maxDrawdown: number
    numTrades: number
    winRate: number
    sharpeRatio: number | null
  }
  buyAndHold: {
    finalCapital: number
    totalReturn: number
    maxDrawdown: number
  }
  trades: Trade[]
  dailyPortfolio: DailyPoint[]
}

// ─── 포맷 헬퍼 ───────────────────────────────────────────────────────────────
function fmtNum(n: number) {
  return n.toLocaleString('ko-KR')
}
function fmtPct(n: number) {
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
}
function pctColor(n: number) {
  return n >= 0 ? '#4ECDC4' : '#FF6B6B'
}

const SIGNAL_KO: Record<string, string> = {
  strong_buy:  '강매수',
  buy:         '매수',
  watch:       '관망',
  sell:        '매도',
  strong_sell: '강매도',
}

// ─── 커스텀 툴팁 ─────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as DailyPoint
  return (
    <div style={{
      background: '#252B45',
      border: '1px solid #404880',
      borderRadius: 8,
      padding: '10px 14px',
      fontSize: 12,
    }}>
      <div style={{ color: '#7A82A8', marginBottom: 6 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}: {fmtNum(p.value)}원
        </div>
      ))}
      <div style={{ color: '#7A82A8', marginTop: 6 }}>
        시그널: <span style={{ color: '#ECEEF8' }}>{SIGNAL_KO[d?.signal] ?? d?.signal}</span>
      </div>
      {d?.action && (
        <div style={{
          marginTop: 4,
          fontWeight: 700,
          color: d.action === 'buy' ? '#4ECDC4' : '#FF6B6B',
        }}>
          ● {d.action === 'buy' ? '매수 체결' : '매도 체결'}
        </div>
      )}
    </div>
  )
}

// ─── 요약 카드 ───────────────────────────────────────────────────────────────
function MetricCard({
  label, value, sub, color,
}: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{
      background: '#252B45',
      border: '1px solid #2D3460',
      borderRadius: 10,
      padding: '16px 18px',
    }}>
      <div style={{ fontSize: 11, color: '#7A82A8', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color ?? '#ECEEF8' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#7A82A8', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

// ─── 메인 페이지 ─────────────────────────────────────────────────────────────
export default function BacktestPage() {
  const [ticker, setTicker]         = useState('')
  const [capital, setCapital]       = useState('10000000')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [result, setResult]         = useState<BacktestResult | null>(null)

  const runBacktest = useCallback(async () => {
    const t = ticker.trim().toUpperCase()
    if (!t) { setError('티커를 입력하세요.'); return }
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: t, initialCapital: Number(capital) }),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error ?? '알 수 없는 오류')
      setResult(json)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [ticker, capital])

  const buyDates  = result?.dailyPortfolio.filter(d => d.action === 'buy').map(d => d.date)  ?? []
  const sellDates = result?.dailyPortfolio.filter(d => d.action === 'sell').map(d => d.date) ?? []

  return (
    <div style={{ minHeight: '100vh', background: '#131626', padding: '24px 20px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
          <Link href="/" style={{
            color: '#7A82A8', textDecoration: 'none', fontSize: 13,
            padding: '6px 12px', border: '1px solid #2D3460', borderRadius: 6,
          }}>
            ← 홈
          </Link>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#ECEEF8' }}>
              백테스트
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#7A82A8' }}>
              룰 기반 AI 전략 (RSI + 볼린저밴드)을 과거 데이터로 시뮬레이션합니다.
              각 시점에서 해당 시점까지의 데이터만 사용하는 워크포워드 방식입니다.
            </p>
          </div>
        </div>

        {/* 입력 폼 */}
        <div style={{
          background: '#252B45',
          border: '1px solid #2D3460',
          borderRadius: 12,
          padding: '20px 22px',
          marginBottom: 28,
          display: 'flex',
          gap: 14,
          alignItems: 'flex-end',
          flexWrap: 'wrap',
        }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#7A82A8', marginBottom: 6 }}>
              티커 (예: AAPL, 005930)
            </label>
            <input
              value={ticker}
              onChange={e => setTicker(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runBacktest()}
              placeholder="AAPL"
              style={{
                background: '#1C2038',
                border: '1px solid #404880',
                borderRadius: 8,
                padding: '9px 14px',
                color: '#ECEEF8',
                fontSize: 15,
                fontWeight: 700,
                width: 160,
                outline: 'none',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#7A82A8', marginBottom: 6 }}>
              초기 투자금 (원/$)
            </label>
            <input
              value={capital}
              onChange={e => setCapital(e.target.value.replace(/[^0-9]/g, ''))}
              style={{
                background: '#1C2038',
                border: '1px solid #404880',
                borderRadius: 8,
                padding: '9px 14px',
                color: '#ECEEF8',
                fontSize: 14,
                width: 180,
                outline: 'none',
              }}
            />
          </div>
          <button
            onClick={runBacktest}
            disabled={loading}
            style={{
              background: loading ? '#2D3460' : '#5C6BC0',
              color: '#ECEEF8',
              border: 'none',
              borderRadius: 8,
              padding: '10px 24px',
              fontSize: 14,
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {loading ? '분석 중...' : '백테스트 실행'}
          </button>
        </div>

        {/* 에러 */}
        {error && (
          <div style={{
            background: '#2D1515',
            border: '1px solid #5C2020',
            borderRadius: 8,
            padding: '12px 16px',
            color: '#FF8585',
            marginBottom: 24,
            fontSize: 13,
          }}>
            오류: {error}
          </div>
        )}

        {/* 로딩 */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#7A82A8' }}>
            <div style={{
              width: 36, height: 36, border: '3px solid #2D3460',
              borderTopColor: '#5C6BC0', borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 16px',
            }} />
            120일 데이터를 워크포워드 방식으로 분석하는 중...
          </div>
        )}

        {/* 결과 */}
        {result && (
          <>
            {/* 기간 정보 */}
            <div style={{ fontSize: 12, color: '#7A82A8', marginBottom: 16 }}>
              {result.ticker} · {result.period.start} ~ {result.period.end} ({result.period.tradingDays}거래일)
              &nbsp;· 수수료 {result.txCostPct}% 반영 · 초기자금 {fmtNum(result.initialCapital)}원
            </div>

            {/* 성과 요약 카드 */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: 12,
              marginBottom: 28,
            }}>
              <MetricCard
                label="전략 수익률"
                value={fmtPct(result.strategy.totalReturn)}
                sub={`최종 ${fmtNum(result.strategy.finalCapital)}원`}
                color={pctColor(result.strategy.totalReturn)}
              />
              <MetricCard
                label="Buy & Hold 수익률"
                value={fmtPct(result.buyAndHold.totalReturn)}
                sub={`최종 ${fmtNum(result.buyAndHold.finalCapital)}원`}
                color={pctColor(result.buyAndHold.totalReturn)}
              />
              <MetricCard
                label="초과수익 (알파)"
                value={fmtPct(result.strategy.totalReturn - result.buyAndHold.totalReturn)}
                sub="전략 − Buy&Hold"
                color={pctColor(result.strategy.totalReturn - result.buyAndHold.totalReturn)}
              />
              <MetricCard
                label="최대낙폭 (MDD)"
                value={`-${result.strategy.maxDrawdown.toFixed(2)}%`}
                sub={`B&H: -${result.buyAndHold.maxDrawdown.toFixed(2)}%`}
                color="#FF6B6B"
              />
              <MetricCard
                label="거래 횟수 / 승률"
                value={`${result.strategy.numTrades}회`}
                sub={`승률 ${result.strategy.winRate.toFixed(1)}%`}
              />
              <MetricCard
                label="샤프 지수"
                value={result.strategy.sharpeRatio != null ? result.strategy.sharpeRatio.toFixed(2) : 'N/A'}
                sub="연환산 (무위험수익률 0%)"
                color={result.strategy.sharpeRatio != null && result.strategy.sharpeRatio > 1 ? '#4ECDC4' : '#ECEEF8'}
              />
            </div>

            {/* 포트폴리오 가치 차트 */}
            <div style={{
              background: '#252B45',
              border: '1px solid #2D3460',
              borderRadius: 12,
              padding: '20px 16px',
              marginBottom: 28,
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#ECEEF8', marginBottom: 16 }}>
                포트폴리오 가치 추이
              </div>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={result.dailyPortfolio} margin={{ top: 4, right: 16, left: 10, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2D3460" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: '#7A82A8' }}
                    tickFormatter={v => v.slice(5)} // MM-DD
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#7A82A8' }}
                    tickFormatter={v => {
                      if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
                      if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K`
                      return String(v)
                    }}
                    width={58}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    formatter={(v) => v === 'strategyValue' ? '전략' : 'Buy & Hold'}
                    wrapperStyle={{ fontSize: 12 }}
                  />
                  {/* 매수 시점 수직선 */}
                  {buyDates.map(d => (
                    <ReferenceLine key={`buy-${d}`} x={d} stroke="#4ECDC4" strokeDasharray="4 2" strokeWidth={1.5} />
                  ))}
                  {/* 매도 시점 수직선 */}
                  {sellDates.map(d => (
                    <ReferenceLine key={`sell-${d}`} x={d} stroke="#FF6B6B" strokeDasharray="4 2" strokeWidth={1.5} />
                  ))}
                  <Line
                    type="monotone"
                    dataKey="strategyValue"
                    stroke="#5C6BC0"
                    strokeWidth={2}
                    dot={false}
                    name="strategyValue"
                  />
                  <Line
                    type="monotone"
                    dataKey="buyHoldValue"
                    stroke="#7A82A8"
                    strokeWidth={1.5}
                    strokeDasharray="5 3"
                    dot={false}
                    name="buyHoldValue"
                  />
                </LineChart>
              </ResponsiveContainer>
              <div style={{ fontSize: 11, color: '#7A82A8', marginTop: 8, textAlign: 'center' }}>
                <span style={{ color: '#4ECDC4' }}>│ 매수</span>
                &nbsp;&nbsp;
                <span style={{ color: '#FF6B6B' }}>│ 매도</span>
                &nbsp;&nbsp;
                (수직선: 체결일)
              </div>
            </div>

            {/* 트레이드 로그 */}
            {result.trades.length > 0 ? (
              <div style={{
                background: '#252B45',
                border: '1px solid #2D3460',
                borderRadius: 12,
                padding: '20px',
                marginBottom: 28,
              }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#ECEEF8', marginBottom: 16 }}>
                  거래 내역 ({result.trades.length}건)
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #2D3460' }}>
                        {['#', '매수일', '매수가', '매도일', '매도가', '보유일', '수익률', '손익'].map(h => (
                          <th key={h} style={{
                            padding: '8px 12px',
                            textAlign: h === '#' || h === '보유일' ? 'center' : 'right',
                            color: '#7A82A8',
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.trades.map((t, i) => (
                        <tr
                          key={i}
                          style={{ borderBottom: '1px solid #1E2440' }}
                        >
                          <td style={{ padding: '9px 12px', textAlign: 'center', color: '#7A82A8' }}>{i + 1}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', color: '#ECEEF8' }}>{t.entryDate}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', color: '#ECEEF8' }}>{fmtNum(t.entryPrice)}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', color: '#ECEEF8' }}>{t.exitDate ?? '-'}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', color: '#ECEEF8' }}>{t.exitPrice ? fmtNum(t.exitPrice) : '-'}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'center', color: '#7A82A8' }}>{t.holdingDays}일</td>
                          <td style={{
                            padding: '9px 12px',
                            textAlign: 'right',
                            fontWeight: 700,
                            color: pctColor(t.returnPct),
                          }}>
                            {fmtPct(t.returnPct)}
                          </td>
                          <td style={{
                            padding: '9px 12px',
                            textAlign: 'right',
                            color: pctColor(t.profitLoss),
                          }}>
                            {t.profitLoss >= 0 ? '+' : ''}{fmtNum(t.profitLoss)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div style={{
                background: '#252B45',
                border: '1px solid #2D3460',
                borderRadius: 12,
                padding: '20px',
                color: '#7A82A8',
                fontSize: 13,
                textAlign: 'center',
                marginBottom: 28,
              }}>
                해당 기간에 매수/매도 시그널이 발생하지 않아 거래가 없었습니다.
              </div>
            )}

            {/* 안내 */}
            <div style={{
              background: '#101D35',
              border: '1px solid #1E3A70',
              borderRadius: 10,
              padding: '14px 18px',
              fontSize: 12,
              color: '#7BA3FF',
              lineHeight: 1.7,
            }}>
              <strong>백테스트 방식 안내</strong><br />
              · 시그널 결정: RSI(14) + 볼린저밴드(20,2) 룰 기반 (Gemini AI 동일 폴백 로직)<br />
              · 매수/매도: 시그널 발생 다음 거래일 시가 체결 (룩어헤드 바이어스 방지)<br />
              · 진입 방식: 전 자본 일괄 투자 (strong_buy/buy → 매수, strong_sell/sell → 매도)<br />
              · 수수료: 매수/매도 각 {result.txCostPct}% 반영<br />
              · 과거 성과가 미래 수익을 보장하지 않습니다.
            </div>
          </>
        )}
      </div>
    </div>
  )
}
