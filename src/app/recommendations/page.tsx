'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import AuthGuard from '@/components/AuthGuard'

const IS_KR = (t: string) => /^\d{6}$/.test(t)

const SIGNAL_META: Record<string, { label: string; color: string; bg: string }> = {
  strong_buy:  { label: '강력매수', color: '#085041', bg: 'rgba(1,135,83,0.15)'  },
  buy:         { label: '매수',     color: '#4CAF50', bg: 'rgba(76,175,80,0.12)' },
  watch:       { label: '관망',     color: '#FF9800', bg: 'rgba(255,152,0,0.12)' },
  sell:        { label: '매도',     color: '#F44336', bg: 'rgba(244,67,54,0.12)' },
  strong_sell: { label: '강력매도', color: '#B71C1C', bg: 'rgba(183,28,28,0.15)' },
}

interface StockRec {
  id: string
  ticker: string
  name: string
  market: 'US' | 'KR'
  reason: string
  signal: string
  fallback: boolean
  strategy: {
    summary: string
    buyStrategy: { entries: { price: number; ratio: number; reason: string }[]; stopLoss: number }
    sellStrategy: { targets: { price: number; ratio: number }[] }
  }
  snapshot: { close: number; rsi: number | null; ma20: number | null }
}

interface Sector {
  sectorId: string
  sectorName: string
  sectorEmoji: string
  stocks: StockRec[]
}

interface RecommendationsData {
  date: string
  sectors: Sector[]
  generatedAt: string
  empty?: boolean
}

function fmtPrice(ticker: string, p: number) {
  return IS_KR(ticker)
    ? `${Math.round(p).toLocaleString('ko-KR')}원`
    : `$${p.toFixed(2)}`
}

function StockCard({ stock }: { stock: StockRec }) {
  const router = useRouter()
  const meta = SIGNAL_META[stock.signal] ?? SIGNAL_META.watch
  const snap = stock.snapshot
  const firstEntry = stock.strategy.buyStrategy.entries[0]
  const firstTarget = stock.strategy.sellStrategy.targets[0]

  return (
    <div
      onClick={() => router.push(`/stock/${stock.ticker}`)}
      style={{
        background: 'var(--color-background-card)',
        border: '0.5px solid var(--color-border-primary)',
        borderRadius: 12,
        padding: '14px 16px',
        cursor: 'pointer',
        transition: 'background 0.15s',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-background-hover)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-background-card)')}
    >
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
            color: meta.color, background: meta.bg, flexShrink: 0,
          }}>
            {meta.label}
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {stock.ticker}
          </span>
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {stock.name}
          </span>
        </div>
        <span style={{
          fontSize: 10, padding: '1px 6px', borderRadius: 4, flexShrink: 0,
          color: stock.market === 'KR' ? 'var(--color-info-text)' : 'var(--color-text-secondary)',
          border: '0.5px solid var(--color-border-secondary)',
        }}>
          {stock.market}
        </span>
      </div>

      {/* 현재가 + RSI */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)' }}>
          {fmtPrice(stock.ticker, snap.close)}
        </span>
        {snap.rsi != null && (
          <span style={{ fontSize: 11, color: snap.rsi < 30 ? 'var(--color-positive-dark)' : snap.rsi > 70 ? 'var(--color-negative-dark)' : 'var(--color-text-secondary)' }}>
            RSI {snap.rsi.toFixed(1)}
          </span>
        )}
        {stock.fallback && (
          <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>규칙 기반</span>
        )}
      </div>

      {/* 요약 */}
      <p style={{
        fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.5,
        margin: 0, display: '-webkit-box', WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {stock.strategy.summary}
      </p>

      {/* 진입 / 목표 / 손절 */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {firstEntry && (
          <span style={{ fontSize: 10, color: 'var(--color-positive-dark)' }}>
            진입 {fmtPrice(stock.ticker, firstEntry.price)}
          </span>
        )}
        {firstTarget && (
          <span style={{ fontSize: 10, color: 'var(--color-info-text)' }}>
            목표 {fmtPrice(stock.ticker, firstTarget.price)}
          </span>
        )}
        <span style={{ fontSize: 10, color: 'var(--color-negative-dark)' }}>
          손절 {fmtPrice(stock.ticker, stock.strategy.buyStrategy.stopLoss)}
        </span>
      </div>

      {/* 섹터 선정 이유 */}
      <p style={{ fontSize: 10, color: 'var(--color-text-tertiary)', margin: 0, lineHeight: 1.4 }}>
        {stock.reason}
      </p>
    </div>
  )
}

function SectorSection({ sector }: { sector: Sector }) {
  const [tab, setTab] = useState<'all' | 'US' | 'KR'>('all')

  const displayed = tab === 'all' ? sector.stocks
    : sector.stocks.filter(s => s.market === tab)

  const usCnt = sector.stocks.filter(s => s.market === 'US').length
  const krCnt = sector.stocks.filter(s => s.market === 'KR').length

  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
          {sector.sectorEmoji} {sector.sectorName}
          <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--color-text-secondary)', marginLeft: 8 }}>
            {sector.stocks.length}종목
          </span>
        </h2>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['all', 'US', 'KR'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                fontSize: 11, padding: '3px 10px', borderRadius: 8,
                border: '0.5px solid var(--color-border-secondary)',
                background: tab === t ? 'var(--color-accent)' : 'none',
                color: tab === t ? '#fff' : 'var(--color-text-secondary)',
                cursor: 'pointer',
              }}
            >
              {t === 'all' ? `전체 ${sector.stocks.length}` : t === 'US' ? `미국 ${usCnt}` : `한국 ${krCnt}`}
            </button>
          ))}
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 10,
      }}>
        {displayed.map(stock => (
          <StockCard key={stock.id} stock={stock} />
        ))}
      </div>
    </section>
  )
}

export default function RecommendationsPage() {
  const { data: session }     = useSession()
  const [data, setData]       = useState<RecommendationsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState<string>('all')
  const [generating, setGenerating] = useState(false)
  const [genLog, setGenLog]   = useState<string | null>(null)

  const isAdmin = !!(
    session?.user?.email &&
    process.env.NEXT_PUBLIC_ADMIN_EMAIL &&
    session.user.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL
  )

  function loadData() {
    setLoading(true)
    fetch('/api/recommendations')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [])

  async function handleGenerate() {
    setGenerating(true)
    setGenLog(null)
    try {
      const res = await fetch('/api/recommendations/generate')
      const json = await res.json()
      const last = json.log?.slice(-3).join('\n') ?? (json.error || '완료')
      setGenLog(`${json.totalDone ?? '?'}종목 처리됨 · ${json.elapsed ?? ''}\n${last}`)
      loadData()
    } catch (e: any) {
      setGenLog(`오류: ${e.message}`)
    } finally {
      setGenerating(false)
    }
  }

  const SIGNAL_FILTERS = [
    { key: 'all',        label: '전체' },
    { key: 'strong_buy', label: '강력매수' },
    { key: 'buy',        label: '매수' },
    { key: 'watch',      label: '관망' },
  ]

  const filteredSectors = data?.sectors.map(s => ({
    ...s,
    stocks: filter === 'all' ? s.stocks : s.stocks.filter(st => st.signal === filter),
  })).filter(s => s.stocks.length > 0) ?? []

  return (
    <AuthGuard>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px 80px' }}>
        {/* 헤더 */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
              오늘의 추천 종목
            </h1>
            {isAdmin && (
              <button
                onClick={handleGenerate}
                disabled={generating}
                style={{
                  fontSize: 12, padding: '6px 14px', borderRadius: 8,
                  border: '0.5px solid var(--color-border-secondary)',
                  background: generating ? 'var(--color-background-secondary)' : 'var(--color-accent)',
                  color: generating ? 'var(--color-text-secondary)' : '#fff',
                  cursor: generating ? 'not-allowed' : 'pointer',
                  flexShrink: 0,
                }}
              >
                {generating ? '생성 중…' : '이어서 생성'}
              </button>
            )}
          </div>
          {data?.date && (
            <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>
              {data.date} 기준 · 섹터 ETF 성과 + Gemini AI 분석
              {data.generatedAt && ` · 생성 ${new Date(data.generatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`}
            </p>
          )}
          {genLog && (
            <pre style={{
              marginTop: 8, fontSize: 11, color: 'var(--color-text-secondary)',
              background: 'var(--color-background-secondary)', borderRadius: 8,
              padding: '8px 12px', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}>
              {genLog}
            </pre>
          )}
        </div>

        {/* 시그널 필터 */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
          {SIGNAL_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                fontSize: 12, padding: '5px 14px', borderRadius: 20,
                border: '0.5px solid var(--color-border-secondary)',
                background: filter === f.key ? 'var(--color-accent)' : 'var(--color-background-secondary)',
                color: filter === f.key ? '#fff' : 'var(--color-text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* 로딩 */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-secondary)' }}>
            데이터 로딩 중…
          </div>
        )}

        {/* 데이터 없음 */}
        {!loading && (data?.empty || !data?.sectors?.length) && (
          <div style={{
            textAlign: 'center', padding: '60px 20px',
            color: 'var(--color-text-secondary)',
            border: '0.5px dashed var(--color-border-secondary)',
            borderRadius: 16,
          }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>오늘의 추천 데이터가 없습니다</div>
            <div style={{ fontSize: 12 }}>매일 새벽 자동으로 업데이트됩니다.</div>
          </div>
        )}

        {/* 섹터별 목록 */}
        {!loading && filteredSectors.map(sector => (
          <SectorSection key={sector.sectorId} sector={sector} />
        ))}

        {/* 필터 결과 없음 */}
        {!loading && data && !data.empty && filteredSectors.length === 0 && filter !== 'all' && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-text-secondary)', fontSize: 13 }}>
            '{SIGNAL_FILTERS.find(f => f.key === filter)?.label}' 종목이 없습니다.
          </div>
        )}
      </div>
    </AuthGuard>
  )
}
