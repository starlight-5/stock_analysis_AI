'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer, Cell,
} from 'recharts'

// ── 타입 ─────────────────────────────────────────────────────────────────────
interface TradeRecord {
  signalDate:     string
  signalClose:    number
  compScore:      number
  compSignal:     string
  geminiSignal:   string | null
  geminiSummary:  string
  entries:        { price: number; ratio: number; reason: string }[]
  stopLoss:       number
  targets:        { price: number; ratio: number; reason: string }[]
  skipped:        boolean
  skipReason?:    string
  firstEntryDate: string | null
  closeDate:      string | null
  closeReason:    string | null
  entriesHit:     number
  totalEntries:   number
  targetsHit:     number
  totalTargets:   number
  returnPct:      number | null
}

interface Summary {
  totalSignals:    number
  geminiConfirmed: number
  executed:        number
  skipped:         number
  wins:            number
  losses:          number
  stopLossHits:    number
  allTargetHits:   number
  winRate:         number
  avgReturn:       number
  avgWin:          number
  avgLoss:         number
  totalReturn:     number
}

interface BacktestResult {
  ticker:       string
  period:       { start: string; end: string; tradingDays: number }
  hasGemini:    boolean
  maxHoldDays:  number
  summary:      Summary
  trades:       TradeRecord[]
}

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────
const pctColor  = (n: number) => n >= 0 ? '#4ECDC4' : '#FF6B6B'
const fmtPct    = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
const fmtNum    = (n: number) => n.toLocaleString('ko-KR')

const CLOSE_LABEL: Record<string, string> = {
  stop_loss:      '손절',
  all_targets:    '전량 목표가',
  partial_target: '일부 목표가',
  timeout:        '기간 만료',
}
const CLOSE_COLOR: Record<string, string> = {
  stop_loss:      '#FF6B6B',
  all_targets:    '#4ECDC4',
  partial_target: '#7BC8C8',
  timeout:        '#7A82A8',
}
const SIGNAL_KO: Record<string, string> = {
  strong_buy: '강매수', buy: '매수', watch: '관망', sell: '매도', strong_sell: '강매도',
}

// ── 요약 카드 ────────────────────────────────────────────────────────────────
function Card({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{
      background: '#252B45', border: '1px solid #2D3460', borderRadius: 10, padding: '14px 16px',
    }}>
      <div style={{ fontSize: 11, color: '#7A82A8', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color ?? '#ECEEF8' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#7A82A8', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

// ── 수익률 바 차트 ───────────────────────────────────────────────────────────
function ReturnChart({ trades }: { trades: TradeRecord[] }) {
  const data = trades
    .filter(t => !t.skipped && t.returnPct !== null)
    .map(t => ({ date: t.signalDate.slice(5), value: t.returnPct!, reason: t.closeReason ?? '' }))

  if (!data.length) return null
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2D3460" />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#7A82A8' }} />
        <YAxis tick={{ fontSize: 10, fill: '#7A82A8' }} tickFormatter={v => `${v}%`} width={44} />
        <Tooltip
          formatter={(v: number) => [`${v >= 0 ? '+' : ''}${v.toFixed(2)}%`, '수익률']}
          contentStyle={{ background: '#252B45', border: '1px solid #404880', borderRadius: 8, fontSize: 12 }}
        />
        <ReferenceLine y={0} stroke="#404880" />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.value >= 0 ? '#4ECDC4' : '#FF6B6B'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── 거래 상세 행 ─────────────────────────────────────────────────────────────
function TradeRow({ t, i }: { t: TradeRecord; i: number }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <tr
        onClick={() => !t.skipped && setOpen(o => !o)}
        style={{
          borderBottom: '1px solid #1E2440',
          background: t.skipped ? '#1C2038' : open ? '#1C2545' : 'transparent',
          cursor: t.skipped ? 'default' : 'pointer',
        }}
      >
        <td style={{ padding: '9px 10px', color: '#7A82A8', textAlign: 'center' }}>{i + 1}</td>
        <td style={{ padding: '9px 10px', color: '#ECEEF8', whiteSpace: 'nowrap' }}>{t.signalDate}</td>
        <td style={{ padding: '9px 10px', color: '#ECEEF8' }}>{fmtNum(t.signalClose)}</td>
        <td style={{ padding: '9px 10px', textAlign: 'center' }}>
          <span style={{
            fontSize: 11, padding: '2px 7px', borderRadius: 4,
            background: '#1C2038',
            color: t.compScore >= 4 ? '#4ECDC4' : t.compScore >= 2 ? '#7BC8C8' : '#ECEEF8',
            fontWeight: 700,
          }}>
            {t.compScore > 0 ? '+' : ''}{t.compScore}
          </span>
        </td>
        <td style={{ padding: '9px 10px', textAlign: 'center' }}>
          {t.geminiSignal
            ? <span style={{
                fontSize: 11, padding: '2px 7px', borderRadius: 4,
                background: (t.geminiSignal === 'buy' || t.geminiSignal === 'strong_buy') ? '#4ECDC422' : '#FF6B6B22',
                color:      (t.geminiSignal === 'buy' || t.geminiSignal === 'strong_buy') ? '#4ECDC4' : '#FF6B6B',
                fontWeight: 700,
              }}>
                {SIGNAL_KO[t.geminiSignal] ?? t.geminiSignal}
              </span>
            : <span style={{ color: '#404880' }}>-</span>
          }
        </td>
        <td style={{ padding: '9px 10px', color: '#7A82A8', fontSize: 11, whiteSpace: 'nowrap' }}>
          {t.skipped
            ? <span style={{ color: '#5C4020' }}>{t.skipReason}</span>
            : `${t.entriesHit}/${t.totalEntries}진입 · ${t.targetsHit}/${t.totalTargets}목표`
          }
        </td>
        <td style={{ padding: '9px 10px', whiteSpace: 'nowrap' }}>
          {t.closeReason
            ? <span style={{ fontSize: 11, color: CLOSE_COLOR[t.closeReason] ?? '#7A82A8' }}>
                {CLOSE_LABEL[t.closeReason] ?? t.closeReason}
              </span>
            : <span style={{ color: '#404880' }}>-</span>
          }
        </td>
        <td style={{
          padding: '9px 10px', fontWeight: 700, whiteSpace: 'nowrap',
          color: t.returnPct !== null ? pctColor(t.returnPct) : '#404880',
        }}>
          {t.returnPct !== null ? fmtPct(t.returnPct) : '-'}
        </td>
        <td style={{ padding: '9px 10px', color: '#7A82A8', fontSize: 12 }}>
          {!t.skipped && <span>{open ? '▲' : '▼'} 상세</span>}
        </td>
      </tr>

      {/* 상세 펼침: Gemini 전략 내용 */}
      {open && !t.skipped && (
        <tr style={{ background: '#131626', borderBottom: '1px solid #1E2440' }}>
          <td colSpan={9} style={{ padding: '14px 20px' }}>
            <div style={{ fontSize: 12, color: '#7A82A8', marginBottom: 10 }}>
              {t.geminiSummary}
            </div>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              {/* 매수 전략 */}
              <div>
                <div style={{ fontSize: 11, color: '#4ECDC4', fontWeight: 700, marginBottom: 6 }}>매수 전략</div>
                {t.entries.map((e, j) => (
                  <div key={j} style={{ fontSize: 11, color: '#ECEEF8', marginBottom: 3 }}>
                    {j + 1}차 {fmtNum(e.price)}원 ({e.ratio}%)
                    <span style={{ color: '#7A82A8', marginLeft: 6 }}>{e.reason}</span>
                  </div>
                ))}
                <div style={{ fontSize: 11, color: '#FF6B6B', marginTop: 6 }}>
                  손절 {fmtNum(t.stopLoss)}원
                </div>
              </div>
              {/* 매도 전략 */}
              <div>
                <div style={{ fontSize: 11, color: '#FF9E6B', fontWeight: 700, marginBottom: 6 }}>매도 전략</div>
                {t.targets.map((tg, j) => (
                  <div key={j} style={{ fontSize: 11, color: '#ECEEF8', marginBottom: 3 }}>
                    {j + 1}차 {fmtNum(tg.price)}원 ({tg.ratio}%)
                    <span style={{ color: '#7A82A8', marginLeft: 6 }}>{tg.reason}</span>
                  </div>
                ))}
              </div>
              {/* 결과 */}
              <div>
                <div style={{ fontSize: 11, color: '#7A82A8', fontWeight: 700, marginBottom: 6 }}>실제 결과</div>
                <div style={{ fontSize: 11, color: '#ECEEF8' }}>
                  진입: {t.firstEntryDate ?? '미체결'}<br />
                  청산: {t.closeDate ?? '-'} ({CLOSE_LABEL[t.closeReason ?? ''] ?? '-'})<br />
                  수익률: <span style={{ fontWeight: 700, color: t.returnPct !== null ? pctColor(t.returnPct) : '#7A82A8' }}>
                    {t.returnPct !== null ? fmtPct(t.returnPct) : '-'}
                  </span>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ── 메인 페이지 ──────────────────────────────────────────────────────────────
export default function BacktestPage() {
  const [ticker,  setTicker]  = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [result,  setResult]  = useState<BacktestResult | null>(null)

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

  const s = result?.summary

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
              복합 스코어로 매수 후보를 찾고, Gemini가 제시한 분할매수·손절·목표가를
              실제 이후 가격에 그대로 대입해 수익률을 계산합니다.
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
              매수 후보마다 Gemini를 호출합니다. 30~60초 소요됩니다.
            </span>
          )}
        </div>

        {error && (
          <div style={{
            background: '#2D1515', border: '1px solid #5C2020', borderRadius: 8,
            padding: '12px 16px', color: '#FF8585', marginBottom: 24, fontSize: 13,
          }}>오류: {error}</div>
        )}

        {loading && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#7A82A8' }}>
            <div style={{
              width: 36, height: 36, border: '3px solid #2D3460',
              borderTopColor: '#5C6BC0', borderRadius: '50%',
              animation: 'spin 0.8s linear infinite', margin: '0 auto 16px',
            }} />
            워크포워드 스코어링 → Gemini 전략 호출 → 가격 시뮬레이션 중...
          </div>
        )}

        {result && s && (
          <>
            {/* 기간 정보 */}
            <div style={{ fontSize: 12, color: '#7A82A8', marginBottom: 16 }}>
              {result.ticker} · {result.period.start} ~ {result.period.end} ({result.period.tradingDays}거래일)
              · 최대 보유 {result.maxHoldDays}거래일
              {!result.hasGemini && (
                <span style={{ color: '#FFB060', marginLeft: 12 }}>
                  ⚠ GEMINI_API_KEY 미설정 — Gemini 호출 없이 복합 스코어만 분석됨
                </span>
              )}
            </div>

            {/* 요약 카드 */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))',
              gap: 10, marginBottom: 20,
            }}>
              <Card label="복합 매수 신호" value={`${s.totalSignals}건`}
                sub={`Gemini 동의 ${s.geminiConfirmed}건`} />
              <Card label="실제 진입 체결" value={`${s.executed}건`}
                sub={`스킵 ${s.skipped}건`} />
              <Card label="승률" value={`${s.winRate}%`}
                sub={`${s.wins}승 ${s.losses}패`}
                color={s.winRate >= 50 ? '#4ECDC4' : '#FF6B6B'} />
              <Card label="평균 수익률" value={fmtPct(s.avgReturn)}
                color={pctColor(s.avgReturn)} />
              <Card label="평균 수익" value={fmtPct(s.avgWin)}
                sub={`평균 손실 ${fmtPct(s.avgLoss)}`}
                color="#4ECDC4" />
              <Card label="손절 / 목표가" value={`${s.stopLossHits} / ${s.allTargetHits}`}
                sub="손절 건수 / 전량 목표 달성" />
              <Card label="누적 수익률" value={fmtPct(s.totalReturn)}
                sub="거래별 수익률 합산"
                color={pctColor(s.totalReturn)} />
            </div>

            {/* 수익률 바 차트 */}
            {result.trades.some(t => !t.skipped) && (
              <div style={{
                background: '#252B45', border: '1px solid #2D3460', borderRadius: 12,
                padding: '20px', marginBottom: 20,
              }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>거래별 수익률</div>
                <ReturnChart trades={result.trades} />
              </div>
            )}

            {/* 거래 로그 */}
            <div style={{
              background: '#252B45', border: '1px solid #2D3460', borderRadius: 12,
              padding: '20px', marginBottom: 20,
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
                거래 상세 ({result.trades.length}건) — 행 클릭 시 Gemini 전략 확인
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #2D3460' }}>
                      {['#', '신호일', '신호가', '복합점수', 'Gemini', '진입/목표', '청산', '수익률', ''].map(h => (
                        <th key={h} style={{
                          padding: '8px 10px', textAlign: 'left',
                          color: '#7A82A8', fontWeight: 600, whiteSpace: 'nowrap',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.trades.map((t, i) => <TradeRow key={i} t={t} i={i} />)}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 방법론 */}
            <div style={{
              background: '#101D35', border: '1px solid #1E3A70', borderRadius: 10,
              padding: '14px 18px', fontSize: 12, color: '#7BA3FF', lineHeight: 1.8,
            }}>
              <strong>백테스트 방법론</strong><br />
              · <strong>후보 감지</strong>: 복합 스코어(RSI·BB·MACD·MA크로스·거래량 합산)가 watch→buy로 전환되는 첫 시점<br />
              · <strong>Gemini 호출</strong>: 해당 시점의 지표 스냅샷을 그대로 Gemini에 전달 → 분할매수 가격·손절선·목표가 수령<br />
              · <strong>가격 시뮬레이션</strong>: 이후 {result.maxHoldDays}거래일간 실제 고·저가로 매수/손절/목표가 체결 여부 확인<br />
              · <strong>수익률</strong>: 기준 자본 대비 실현 손익 비율 (수수료 미반영)<br />
              · 과거 성과가 미래 수익을 보장하지 않습니다.
            </div>
          </>
        )}
      </div>
    </div>
  )
}
