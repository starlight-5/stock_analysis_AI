'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine, ResponsiveContainer, Cell,
} from 'recharts'

// ── 타입 ─────────────────────────────────────────────────────────────────────
interface FwdStats {
  count: number
  avgReturn: number
  winRate: number
  maxGain: number
  maxLoss: number
}
interface PeriodStats { fwd5: FwdStats; fwd10: FwdStats; fwd20: FwdStats }

interface SignalPoint {
  date: string
  close: number
  score: number
  compSignal: string
  geminiSignal: string | null
  geminiReason: string | null
  geminiConfirmed: boolean
  fwd5: { returnPct: number; price: number } | null
  fwd10: { returnPct: number; price: number } | null
  fwd20: { returnPct: number; price: number } | null
}

interface BacktestResult {
  ticker: string
  period: { start: string; end: string; tradingDays: number }
  hasGemini: boolean
  candidateCount: number
  confirmedCount: number
  confirmationRate: number
  stats: { composite: PeriodStats; geminiConfirmed: PeriodStats; random: PeriodStats }
  signalPoints: SignalPoint[]
}

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────
const pctColor = (n: number) => (n >= 0 ? '#4ECDC4' : '#FF6B6B')
const fmtPct   = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
const fmtNum   = (n: number) => n.toLocaleString('ko-KR')

const SIGNAL_KO: Record<string, string> = {
  strong_buy: '강매수', buy: '매수', watch: '관망', sell: '매도', strong_sell: '강매도',
}
const SIGNAL_COLOR: Record<string, string> = {
  strong_buy: '#4ECDC4', buy: '#7BC8C8', watch: '#7A82A8', sell: '#FF9E6B', strong_sell: '#FF6B6B',
}

// ── 비교 바 차트 ──────────────────────────────────────────────────────────────
function CompareChart({ stats }: { stats: BacktestResult['stats'] }) {
  const periods: ('fwd5' | 'fwd10' | 'fwd20')[] = ['fwd5', 'fwd10', 'fwd20']
  const data = periods.map(p => ({
    name: p === 'fwd5' ? '5일 후' : p === 'fwd10' ? '10일 후' : '20일 후',
    '복합 스코어': stats.composite[p].avgReturn,
    'Gemini 확인': stats.geminiConfirmed[p].avgReturn,
    '랜덤 진입':   stats.random[p].avgReturn,
  }))

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2D3460" />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#7A82A8' }} />
        <YAxis tick={{ fontSize: 11, fill: '#7A82A8' }} tickFormatter={v => `${v}%`} />
        <Tooltip
          formatter={(v: number, name: string) => [`${v >= 0 ? '+' : ''}${v.toFixed(2)}%`, name]}
          contentStyle={{ background: '#252B45', border: '1px solid #404880', borderRadius: 8, fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <ReferenceLine y={0} stroke="#404880" />
        <Bar dataKey="복합 스코어"  fill="#5C6BC0" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Gemini 확인" fill="#4ECDC4" radius={[4, 4, 0, 0]} />
        <Bar dataKey="랜덤 진입"   fill="#404880" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── 수익률 분포 ──────────────────────────────────────────────────────────────
function ReturnDots({ points, field }: { points: SignalPoint[]; field: 'fwd5' | 'fwd10' | 'fwd20' }) {
  const confirmed = points.filter(p => p.geminiConfirmed && p[field] !== null)
  const notConf   = points.filter(p => !p.geminiConfirmed && p[field] !== null)

  const data = [
    ...confirmed.map(p => ({ date: p.date, value: p[field]!.returnPct, confirmed: true })),
    ...notConf.map(p => ({ date: p.date, value: p[field]!.returnPct, confirmed: false })),
  ].sort((a, b) => a.date.localeCompare(b.date))

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2D3460" />
        <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#7A82A8' }} tickFormatter={v => v.slice(5)} />
        <YAxis tick={{ fontSize: 9, fill: '#7A82A8' }} tickFormatter={v => `${v}%`} width={40} />
        <Tooltip
          formatter={(v: number) => [`${v >= 0 ? '+' : ''}${v.toFixed(2)}%`]}
          contentStyle={{ background: '#252B45', border: '1px solid #404880', borderRadius: 8, fontSize: 11 }}
        />
        <ReferenceLine y={0} stroke="#404880" />
        <Bar dataKey="value" name="수익률" radius={[3, 3, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.value >= 0 ? (d.confirmed ? '#4ECDC4' : '#5C6BC0') : '#FF6B6B'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── 메인 페이지 ──────────────────────────────────────────────────────────────
export default function BacktestPage() {
  const [ticker,  setTicker]  = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [result,  setResult]  = useState<BacktestResult | null>(null)
  const [activeTab, setTab]   = useState<'fwd5' | 'fwd10' | 'fwd20'>('fwd10')

  const run = useCallback(async () => {
    const t = ticker.trim().toUpperCase()
    if (!t) { setError('티커를 입력하세요.'); return }
    setLoading(true); setError(null); setResult(null)
    try {
      const res  = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: t }),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error ?? '알 수 없는 오류')
      setResult(json)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [ticker])

  const tabStats = result ? {
    comp: result.stats.composite[activeTab],
    gem:  result.stats.geminiConfirmed[activeTab],
    rand: result.stats.random[activeTab],
  } : null

  return (
    <div style={{ minHeight: '100vh', background: '#131626', padding: '24px 20px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 28 }}>
          <Link href="/" style={{
            color: '#7A82A8', textDecoration: 'none', fontSize: 13,
            padding: '6px 12px', border: '1px solid #2D3460', borderRadius: 6, whiteSpace: 'nowrap',
          }}>← 홈</Link>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>백테스트</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#7A82A8' }}>
              복합 스코어링(RSI·BB·MACD·MA크로스·거래량)으로 매수 후보를 찾고,
              Gemini AI가 동의한 시점의 실제 수익률을 검증합니다.
            </p>
          </div>
        </div>

        {/* 입력 */}
        <div style={{
          background: '#252B45', border: '1px solid #2D3460', borderRadius: 12,
          padding: '20px 22px', marginBottom: 24,
          display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap',
        }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#7A82A8', marginBottom: 6 }}>
              티커 (예: AAPL, 005930)
            </label>
            <input
              value={ticker}
              onChange={e => setTicker(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && run()}
              placeholder="AAPL"
              style={{
                background: '#1C2038', border: '1px solid #404880', borderRadius: 8,
                padding: '9px 14px', color: '#ECEEF8', fontSize: 15, fontWeight: 700,
                width: 160, outline: 'none',
              }}
            />
          </div>
          <button
            onClick={run} disabled={loading}
            style={{
              background: loading ? '#2D3460' : '#5C6BC0', color: '#ECEEF8',
              border: 'none', borderRadius: 8, padding: '10px 24px',
              fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? '분석 중...' : '백테스트 실행'}
          </button>
          {loading && (
            <span style={{ fontSize: 12, color: '#7A82A8', alignSelf: 'center' }}>
              매수 후보마다 Gemini를 호출합니다. 30~60초 소요될 수 있습니다.
            </span>
          )}
        </div>

        {/* 에러 */}
        {error && (
          <div style={{
            background: '#2D1515', border: '1px solid #5C2020', borderRadius: 8,
            padding: '12px 16px', color: '#FF8585', marginBottom: 24, fontSize: 13,
          }}>오류: {error}</div>
        )}

        {/* 로딩 */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#7A82A8' }}>
            <div style={{
              width: 36, height: 36, border: '3px solid #2D3460',
              borderTopColor: '#5C6BC0', borderRadius: '50%',
              animation: 'spin 0.8s linear infinite', margin: '0 auto 16px',
            }} />
            워크포워드 스코어링 → Gemini 확인 호출 중...
          </div>
        )}

        {/* 결과 */}
        {result && (
          <>
            {/* 요약 배너 */}
            <div style={{
              background: '#252B45', border: '1px solid #2D3460', borderRadius: 12,
              padding: '16px 22px', marginBottom: 20,
              display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'center',
            }}>
              <div style={{ fontSize: 12, color: '#7A82A8' }}>
                {result.ticker} · {result.period.start} ~ {result.period.end} ({result.period.tradingDays}거래일)
              </div>
              <div style={{ display: 'flex', gap: 24 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#7A82A8' }}>복합 스코어 매수 신호</div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{result.candidateCount}건</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#7A82A8' }}>Gemini 동의</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#4ECDC4' }}>
                    {result.confirmedCount}건
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#7A82A8' }}>확인율</div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{result.confirmationRate}%</div>
                </div>
                {!result.hasGemini && (
                  <div style={{
                    fontSize: 12, color: '#FFB060', background: '#2D2210',
                    border: '1px solid #5C4020', borderRadius: 6, padding: '6px 12px',
                    alignSelf: 'center',
                  }}>
                    GEMINI_API_KEY 미설정 — Gemini 확인 없이 복합 스코어만 표시
                  </div>
                )}
              </div>
            </div>

            {/* 기간 탭 */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {(['fwd5', 'fwd10', 'fwd20'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    padding: '6px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                    border: '1px solid',
                    borderColor: activeTab === t ? '#5C6BC0' : '#2D3460',
                    background: activeTab === t ? '#5C6BC0' : 'transparent',
                    color: activeTab === t ? '#ECEEF8' : '#7A82A8',
                    cursor: 'pointer',
                  }}
                >
                  {t === 'fwd5' ? '5일 후' : t === 'fwd10' ? '10일 후' : '20일 후'}
                </button>
              ))}
            </div>

            {/* 3-열 비교 카드 */}
            {tabStats && (
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20,
              }}>
                {[
                  { label: '복합 스코어 매수', s: tabStats.comp,  color: '#5C6BC0', icon: '📊' },
                  { label: 'Gemini 확인 매수',  s: tabStats.gem,   color: '#4ECDC4', icon: '🤖' },
                  { label: '랜덤 진입 (기준)',   s: tabStats.rand,  color: '#7A82A8', icon: '🎲' },
                ].map(({ label, s, color, icon }) => (
                  <div key={label} style={{
                    background: '#252B45', border: `1px solid #2D3460`,
                    borderRadius: 12, padding: '16px 18px',
                  }}>
                    <div style={{ fontSize: 12, color: '#7A82A8', marginBottom: 10 }}>
                      {icon} {label}
                    </div>
                    <div style={{ fontSize: 26, fontWeight: 700, color: pctColor(s.avgReturn), marginBottom: 8 }}>
                      {fmtPct(s.avgReturn)}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 11 }}>
                      <div style={{ color: '#7A82A8' }}>승률</div>
                      <div style={{ color: '#ECEEF8', textAlign: 'right' }}>{s.winRate}%</div>
                      <div style={{ color: '#7A82A8' }}>최대 수익</div>
                      <div style={{ color: '#4ECDC4', textAlign: 'right' }}>+{s.maxGain}%</div>
                      <div style={{ color: '#7A82A8' }}>최대 손실</div>
                      <div style={{ color: '#FF6B6B', textAlign: 'right' }}>{s.maxLoss}%</div>
                      <div style={{ color: '#7A82A8' }}>신호 수</div>
                      <div style={{ color: '#ECEEF8', textAlign: 'right' }}>{s.count}건</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 평균 수익률 비교 차트 */}
            <div style={{
              background: '#252B45', border: '1px solid #2D3460', borderRadius: 12,
              padding: '20px', marginBottom: 20,
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
                기간별 평균 수익률 비교
              </div>
              <CompareChart stats={result.stats} />
            </div>

            {/* 개별 신호 수익률 분포 */}
            {result.signalPoints.length > 0 && (
              <div style={{
                background: '#252B45', border: '1px solid #2D3460', borderRadius: 12,
                padding: '20px', marginBottom: 20,
              }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                  매수 신호별 수익률 분포 ({activeTab === 'fwd5' ? '5' : activeTab === 'fwd10' ? '10' : '20'}일 후)
                </div>
                <div style={{ fontSize: 11, color: '#7A82A8', marginBottom: 12 }}>
                  <span style={{ color: '#4ECDC4' }}>■</span> Gemini 확인 &nbsp;
                  <span style={{ color: '#5C6BC0' }}>■</span> 복합 스코어만 &nbsp;
                  <span style={{ color: '#FF6B6B' }}>■</span> 손실
                </div>
                <ReturnDots points={result.signalPoints} field={activeTab} />
              </div>
            )}

            {/* 신호 상세 테이블 */}
            <div style={{
              background: '#252B45', border: '1px solid #2D3460', borderRadius: 12,
              padding: '20px', marginBottom: 20,
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
                매수 신호 상세 ({result.signalPoints.length}건)
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #2D3460' }}>
                      {['날짜', '가격', '복합점수', '복합시그널', 'Gemini', '5일', '10일', '20일', 'Gemini 판단 이유'].map(h => (
                        <th key={h} style={{
                          padding: '8px 10px', textAlign: 'left',
                          color: '#7A82A8', fontWeight: 600, whiteSpace: 'nowrap',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.signalPoints.map((p, i) => (
                      <tr key={i} style={{
                        borderBottom: '1px solid #1E2440',
                        background: p.geminiConfirmed ? 'rgba(78,205,196,0.04)' : 'transparent',
                      }}>
                        <td style={{ padding: '8px 10px', color: '#ECEEF8', whiteSpace: 'nowrap' }}>{p.date}</td>
                        <td style={{ padding: '8px 10px', color: '#ECEEF8', whiteSpace: 'nowrap' }}>{fmtNum(p.close)}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          <span style={{
                            background: '#1C2038', borderRadius: 4,
                            padding: '2px 8px', fontWeight: 700,
                            color: p.score >= 4 ? '#4ECDC4' : p.score >= 2 ? '#7BC8C8' : '#ECEEF8',
                          }}>{p.score > 0 ? '+' : ''}{p.score}</span>
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <span style={{
                            fontSize: 11, padding: '2px 8px', borderRadius: 4,
                            background: (SIGNAL_COLOR[p.compSignal] ?? '#7A82A8') + '22',
                            color: SIGNAL_COLOR[p.compSignal] ?? '#7A82A8',
                          }}>
                            {SIGNAL_KO[p.compSignal] ?? p.compSignal}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          {p.geminiSignal ? (
                            <span style={{
                              fontSize: 11, padding: '2px 8px', borderRadius: 4,
                              background: (SIGNAL_COLOR[p.geminiSignal] ?? '#7A82A8') + '22',
                              color: SIGNAL_COLOR[p.geminiSignal] ?? '#7A82A8',
                              fontWeight: p.geminiConfirmed ? 700 : 400,
                            }}>
                              {SIGNAL_KO[p.geminiSignal] ?? p.geminiSignal}
                              {p.geminiConfirmed ? ' ✓' : ''}
                            </span>
                          ) : <span style={{ color: '#404880' }}>-</span>}
                        </td>
                        {(['fwd5', 'fwd10', 'fwd20'] as const).map(f => (
                          <td key={f} style={{
                            padding: '8px 10px', fontWeight: 600, whiteSpace: 'nowrap',
                            color: p[f] ? pctColor(p[f]!.returnPct) : '#404880',
                          }}>
                            {p[f] ? fmtPct(p[f]!.returnPct) : '-'}
                          </td>
                        ))}
                        <td style={{ padding: '8px 10px', color: '#7A82A8', fontSize: 11, maxWidth: 240 }}>
                          {p.geminiReason ?? '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 방법론 안내 */}
            <div style={{
              background: '#101D35', border: '1px solid #1E3A70', borderRadius: 10,
              padding: '14px 18px', fontSize: 12, color: '#7BA3FF', lineHeight: 1.7,
            }}>
              <strong>백테스트 방법론</strong><br />
              · <strong>복합 스코어링</strong>: RSI(-2~+2) + 볼린저밴드(-3~+3) + MACD 히스토그램(-2~+2) + MA 20/60 크로스(-2~+2) + MA 5/20 크로스(-1~+1) + 거래량×방향(-1~+1) → 합산 -10~+10<br />
              · <strong>매수 후보</strong>: 스코어가 watch→buy(≥+2) 또는 strong_buy(≥+4)로 전환되는 첫 시점<br />
              · <strong>Gemini 확인</strong>: 각 후보 시점의 지표 스냅샷을 Gemini에 전달해 buy/strong_buy 동의 여부 확인<br />
              · <strong>수익률 측정</strong>: 신호 발생일 종가 대비 5/10/20거래일 후 종가 수익률 (수수료 미반영)<br />
              · 과거 성과가 미래 수익을 보장하지 않습니다.
            </div>
          </>
        )}
      </div>
    </div>
  )
}
