'use client'

import { useEffect, useState, useMemo, useCallback, memo } from 'react'
import { useRouter } from 'next/navigation'
import AuthGuard from '@/components/AuthGuard'
import type { WatchlistItem } from '@/types/stock'
import type { RankingItem } from './api/rankings/route'
import type { QuoteData } from './api/quotes/route'
import type { TrendingSectorsData } from './api/trending-sectors/route'
import SearchBar from '@/components/SearchBar'

// ─── 타입 ────────────────────────────────────────────────────────
type MarketQuote = { price: number; change: number; changePct: number }
type MarketData  = Record<string, MarketQuote>
type SortMode    = 'dollar' | 'volume'
type MarketTab   = 'us' | 'kr'

// ─── 정적 상수 (모듈 수준 — 렌더마다 재생성 없음) ─────────────────
const DEFAULT_WATCHLIST: Omit<WatchlistItem, 'id' | 'addedAt'>[] = [
  { ticker: 'AAPL', name: 'Apple' },
  { ticker: 'MSFT', name: 'Microsoft' },
  { ticker: 'NVDA', name: 'NVIDIA' },
  { ticker: 'META', name: 'Meta' },
  { ticker: 'GOOGL', name: 'Alphabet' },
]

const MARKET_CONFIG = [
  { symbol: '^IXIC',    label: 'NASDAQ',   fmt: (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 }), showChange: true  },
  { symbol: '^GSPC',    label: 'S&P 500',  fmt: (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 }), showChange: true  },
  { symbol: '^VIX',     label: 'VIX',      fmt: (v: number) => v.toFixed(2),           showChange: true  },
  // showChange: false — 전일 환율 조회 성공 시 changePct !== 0 이면 자동으로 표시됨
  { symbol: 'USDKRW=X', label: 'USD/KRW', fmt: (v: number) => v.toFixed(2) + '원',    showChange: false },
] as const

const MARKET_TABS: [MarketTab, string][] = [['us', '🇺🇸 US'], ['kr', '🇰🇷 한국']]
const SORT_MODES:  [SortMode, string][]  = [['dollar', '거래대금 순'], ['volume', '거래량 순']]

const ICON_COLORS = [
  '#3B6EFF','#FF5A5A','#1DB87A','#F5A623','#A855F7',
  '#06B6D4','#F97316','#EC4899','#10B981','#6366F1',
] as const

const IS_KR_RE = /^\d{6}$/

// ─── 유틸 ────────────────────────────────────────────────────────

function colorFor(ticker: string): string {
  let hash = 5381
  for (let i = 0; i < ticker.length; i++) {
    hash = (hash * 33) ^ ticker.charCodeAt(i)
  }
  return ICON_COLORS[Math.abs(hash) % ICON_COLORS.length]
}

function fmtDollarVol(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(1)}B`
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(0)}M`
  return `$${v.toLocaleString()}`
}

function fmtKRWVol(v: number): string {
  if (v >= 1e12) return `${(v / 1e12).toFixed(1)}조`
  if (v >= 1e8)  return `${(v / 1e8).toFixed(0)}억`
  if (v >= 1e4)  return `${(v / 1e4).toFixed(0)}만`
  return v.toLocaleString('ko-KR')
}

function fmtVolume(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`
  return v.toString()
}

// ─── 커스텀 훅 ───────────────────────────────────────────────────

function useMarketData(): MarketData | null {
  const [market, setMarket] = useState<MarketData | null>(null)
  useEffect(() => {
    let isMounted = true
    const ctrl = new AbortController()

    const doFetch = async () => {
      try {
        const r = await fetch('/api/market', { signal: ctrl.signal })
        const d = await r.json()
        if (isMounted && !d.error) setMarket(d)
      } catch {}
    }

    doFetch()
    const id = setInterval(doFetch, 5 * 60 * 1000)

    return () => { isMounted = false; ctrl.abort(); clearInterval(id) }
  }, [])
  return market
}

function useRankings(marketTab: MarketTab) {
  const [rankings,    setRankings]    = useState<RankingItem[] | null>(null)
  const [error,       setError]       = useState<string | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [refreshing,  setRefreshing]  = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  useEffect(() => {
    let isMounted = true
    const ctrl    = new AbortController()

    const doFetch = async (background: boolean) => {
      if (!isMounted) return
      if (background) setRefreshing(true)

      try {
        const res  = await fetch(`/api/rankings?market=${marketTab}`, { signal: ctrl.signal })
        const data = await res.json()
        if (!isMounted || ctrl.signal.aborted) return
        if (data.error) setError(data.error)
        else { setRankings(data); setError(null); setLastUpdated(new Date()) }
      } catch (e: any) {
        if (!isMounted || e.name === 'AbortError') return
        setError('랭킹 데이터 로드 실패')
      } finally {
        if (isMounted && !ctrl.signal.aborted) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    }

    // 탭 전환(초기 로드): 데이터 초기화 + 스피너
    setRankings(null); setError(null); setLoading(true); setRefreshing(false)
    doFetch(false)

    // 5분마다 백그라운드 자동 갱신 (기존 데이터 유지, 소형 스피너만 표시)
    const id = setInterval(() => doFetch(true), 5 * 60 * 1000)

    return () => {
      isMounted = false
      ctrl.abort()
      clearInterval(id)
    }
  }, [marketTab])

  return { rankings, error, loading, refreshing, lastUpdated }
}

function useWatchlist() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([])

  useEffect(() => {
    const ctrl = new AbortController()
    const doFetch = async () => {
      try {
        const r    = await fetch('/api/watchlist', { signal: ctrl.signal })
        const data = await r.json()
        if (ctrl.signal.aborted) return
        setWatchlist(
          Array.isArray(data) && data.length > 0
            ? data
            : DEFAULT_WATCHLIST.map((w, i) => ({
                ...w, id: `default-${i}`, addedAt: new Date().toISOString(),
              }))
        )
      } catch {}
    }
    doFetch()
    return () => ctrl.abort()
  }, [])

  // [FIX 5] 반환 타입을 Promise<WatchlistItem | null>로 명시 →
  // RankingRow에서 결과를 받아 에러 피드백 가능
  const add = useCallback(async (ticker: string, name: string): Promise<WatchlistItem | null> => {
    try {
      const res  = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker, name }),
      })
      const item: WatchlistItem & { error?: string } = await res.json()
      if (item.error) return null
      setWatchlist(prev => [...prev, item])
      return item
    } catch { return null }
  }, [])

  const remove = useCallback(async (ticker: string) => {
    await fetch(`/api/watchlist?ticker=${ticker}`, { method: 'DELETE' })
    setWatchlist(prev => prev.filter(w => w.ticker !== ticker))
  }, [])

  const watchedSet = useMemo(() => new Set(watchlist.map(w => w.ticker)), [watchlist])

  return { watchlist, watchedSet, add, remove }
}

type WatchQuotes = Record<string, QuoteData | null>

function useWatchlistData(tickers: string[]) {
  const [quotes, setQuotes] = useState<WatchQuotes>({})
  const key = tickers.join(',')

  useEffect(() => {
    if (!tickers.length) return
    const ctrl = new AbortController()
    const doFetch = async () => {
      try {
        const r    = await fetch(`/api/quotes?tickers=${key}`, { signal: ctrl.signal })
        const data = await r.json()
        if (!ctrl.signal.aborted) setQuotes(data)
      } catch {}
    }
    doFetch()
    const id = setInterval(doFetch, 5 * 60 * 1000)
    return () => { ctrl.abort(); clearInterval(id) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return { quotes }
}

function useTrendingSectors() {
  const [data, setData] = useState<TrendingSectorsData | null>(null)
  useEffect(() => {
    const doFetch = async () => {
      try {
        const r    = await fetch('/api/trending-sectors')
        const data = await r.json()
        setData(data)
      } catch {}
    }
    doFetch()
  }, [])
  return data
}

// ─── 시장 분석 ────────────────────────────────────────────────────

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
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
      }}>
        <div style={{ fontSize: 11, color: '#7BA3FF', marginBottom: 3 }}>✦ 시장 분석</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>데이터 로딩 중…</div>
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
        <span style={{ fontSize: 11, color: '#A3B4FF' }}>✦ 시장 분석</span>
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

// ─── 시장 개장 여부 ───────────────────────────────────────────────

/**
 * Intl.DateTimeFormat + 시간대 이름 사용 → 서머타임(DST) 자동 처리.
 * 직접 UTC 오프셋을 계산하면 DST 처리가 틀릴 수 있어 이 방식이 정확.
 */
function getMarketStatus(): { krOpen: boolean; usOpen: boolean } {
  const now = new Date()

  const parts = (tz: string) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, weekday: 'short',
      hour: 'numeric', minute: 'numeric', hour12: false,
    }).formatToParts(now)

  const val = (ps: Intl.DateTimeFormatPart[], t: string) =>
    parseInt(ps.find(p => p.type === t)?.value ?? '0', 10) % 24 // 일부 환경에서 24 반환 방지

  const kp = parts('Asia/Seoul')
  const up = parts('America/New_York')

  const kMin = val(kp, 'hour') * 60 + val(kp, 'minute')
  const uMin = val(up, 'hour') * 60 + val(up, 'minute')
  const kDay = kp.find(p => p.type === 'weekday')?.value ?? ''
  const uDay = up.find(p => p.type === 'weekday')?.value ?? ''
  const wday = (d: string) => !['Sat', 'Sun'].includes(d)

  return {
    krOpen: wday(kDay) && kMin >= 9*60       && kMin < 15*60+30, // 09:00~15:30 KST
    usOpen: wday(uDay) && uMin >= 9*60+30    && uMin < 16*60,    // 09:30~16:00 ET
  }
}

/** 1분마다 갱신 */
function useMarketStatus() {
  const [status, setStatus] = useState(getMarketStatus)
  useEffect(() => {
    const id = setInterval(() => setStatus(getMarketStatus()), 60_000)
    return () => clearInterval(id)
  }, [])
  return status
}

// ─── 서브 컴포넌트 ────────────────────────────────────────────────

function TickerIcon({ ticker, size = 36, market }: { ticker: string; size?: number; market?: 'us' | 'kr' }) {
  const [imgFailed, setImgFailed] = useState(false)
  const color = colorFor(ticker)
  const radius = Math.round(size * 0.3)
  const isKR = market === 'kr' || /^\d+$/.test(ticker)
  const imgSrc = isKR
    ? `https://static.toss.im/png-icons/securities/icn-sec-fill-A${ticker}.png`
    : `https://financialmodelingprep.com/image-stock/${ticker}.png`

  return (
    <div style={{
      width: size, height: size, borderRadius: radius,
      background: color + '1A', border: `1px solid ${color}33`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden', flexShrink: 0,
    }}>
      {!imgFailed ? (
        <img
          src={imgSrc}
          alt={ticker}
          width={size}
          height={size}
          style={{ objectFit: 'cover', display: 'block' }}
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span style={{
          fontWeight: 700, fontSize: size < 32 ? 9 : 11, color,
          letterSpacing: '-0.5px',
        }}>
          {ticker.slice(0, 4)}
        </span>
      )}
    </div>
  )
}

const NAME_SUFFIXES = /\s+(Inc\.?|Corp\.?|Corporation|Holdings?|Ltd\.?|Limited|Co\.?|Group|Plc\.?|N\.V\.?|S\.A\.?|Class\s+[A-C]|Ordinary\s+Shares?)\s*$/gi

function shortenName(name: string): string {
  return name.replace(NAME_SUFFIXES, '').replace(/[,.\s]+$/, '').trim()
}

function StatusDot({ label, hours, active }: { label: string; hours: string; active?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{
        width: 6, height: 6, borderRadius: '50%',
        background: active ? '#4ADE80' : '#7A82A8',
        boxShadow: active ? '0 0 5px #4ADE8088' : 'none',
      }} />
      <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
        {label} {hours}
      </span>
      <span style={{
        fontSize: 9, padding: '1px 5px', borderRadius: 4, fontWeight: 700,
        background: active ? '#4ADE8020' : '#7A82A815',
        color:      active ? '#4ADE80'   : '#7A82A8',
        border: `0.5px solid ${active ? '#4ADE8040' : '#7A82A830'}`,
      }}>
        {active ? '개장' : '휴장'}
      </span>
    </div>
  )
}

// ─── 랭킹 행 ──────────────────────────────────────────────────────
/**
 * [FIX 1] onNavigate 클로저 제거 — navigate(path) + symbol prop 방식으로 변경.
 * navigate는 HomePage에서 useCallback([router])로 생성한 안정된 참조.
 * → memo(RankingRow)가 onNavigate 때문에 깨지던 문제 해결.
 *
 * [FIX 5] onWatch 반환 타입을 Promise<WatchlistItem | null>로 변경.
 * 추가 실패 시 addFailed 상태로 2초간 시각 피드백 제공.
 */
const RankingRow = memo(function RankingRow({
  item, rank, sortMode, marketTab, isWatched, onWatch, navigate,
}: {
  item: RankingItem
  rank: number
  sortMode: SortMode
  marketTab: MarketTab
  isWatched: boolean
  onWatch: (ticker: string, name: string) => Promise<WatchlistItem | null>
  navigate: (path: string) => void
}) {
  const [hovered,   setHovered]   = useState(false)
  const [addFailed, setAddFailed] = useState(false) // [FIX 5] 추가 실패 피드백
  const up = item.changePct >= 0
  const changeColor = up ? '#4ADE80' : '#FF5A5A'
  const isKR = marketTab === 'kr'

  const handleWatch = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isWatched || addFailed) return
    const result = await onWatch(item.symbol, item.name)
    if (!result) {
      // 서버 에러 (중복·API 오류 등) → 2초간 ✕ 표시 후 복구
      setAddFailed(true)
      setTimeout(() => setAddFailed(false), 2000)
    }
  }, [isWatched, addFailed, onWatch, item.symbol, item.name])

  return (
    <div
      onClick={() => navigate(`/stock/${item.symbol}`)} // [FIX 1] 안정된 참조 사용
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: '44px 1fr 110px 80px 120px 40px',
        alignItems: 'center',
        padding: '10px 16px',
        borderBottom: '1px solid var(--color-border-tertiary)',
        cursor: 'pointer',
        background: hovered ? 'var(--color-background-secondary)' : 'transparent',
        transition: 'background .1s',
      }}
    >
      <span style={{
        fontSize: 14, fontWeight: 700,
        color: rank <= 3 ? '#3B6EFF' : rank <= 10 ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
      }}>
        {rank}
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <TickerIcon ticker={item.symbol} size={34} market={item.market} />
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {shortenName(item.name)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 1 }}>
            {item.symbol}
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
          {isKR
            ? item.price.toLocaleString('ko-KR') + '원'
            : '$' + item.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div style={{ fontSize: 11, color: changeColor, marginTop: 1 }}>
          {up ? '+' : ''}{isKR ? item.change.toLocaleString('ko-KR') : item.change.toFixed(2)}
        </div>
      </div>

      <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 600, color: changeColor }}>
        {up ? '+' : ''}{item.changePct.toFixed(2)}%
      </div>

      <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--color-text-secondary)' }}>
        {sortMode === 'dollar'
          ? isKR ? fmtKRWVol(item.dollarVolume) : fmtDollarVol(item.dollarVolume)
          : fmtVolume(item.volume)}
      </div>

      {/* [FIX 5] 추가 실패 시 ✕ 표시, 성공 시 ♥ */}
      <div style={{ display: 'flex', justifyContent: 'center' }} onClick={handleWatch}>
        <span
          title={addFailed ? '추가 실패 (이미 등록됐거나 오류)' : isWatched ? '관심 등록됨' : '관심 추가'}
          style={{
            fontSize: 16,
            cursor: isWatched || addFailed ? 'default' : 'pointer',
            color: addFailed ? '#F5A623' : isWatched ? '#FF5A5A' : 'var(--color-border-primary)',
            transition: 'color .15s', userSelect: 'none',
          }}
        >
          {addFailed ? '✕' : isWatched ? '♥' : '♡'}
        </span>
      </div>
    </div>
  )
})

// ─── 사이드바 종목 행 ──────────────────────────────────────────────
/**
 * [FIX 1] onNavigate/onRemove 클로저 제거.
 * navigate/remove를 안정된 참조로 전달하고, ticker를 별도 prop으로 받아 내부에서 호출.
 * → memo(SidebarItem)이 watchlist 순서 변경 없이는 리렌더되지 않음.
 */
const SidebarItem = memo(function SidebarItem({
  item, isLast, navigate, remove, quote,
}: {
  item: WatchlistItem
  isLast: boolean
  navigate: (path: string) => void
  remove: (ticker: string) => void
  quote: QuoteData | null
}) {
  const [hovered, setHovered] = useState(false)
  const isKR = IS_KR_RE.test(item.ticker)
  const up = (quote?.changePct ?? 0) >= 0
  const changeColor = up ? '#4ADE80' : '#FF5A5A'

  return (
    <div
      onClick={() => navigate(`/stock/${item.ticker}`)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px',
        borderBottom: isLast ? 'none' : '1px solid var(--color-border-tertiary)',
        cursor: 'pointer',
        background: hovered ? 'var(--color-background-secondary)' : 'transparent',
        transition: 'background .1s',
      }}
    >
      <TickerIcon ticker={item.ticker} size={32} market={isKR ? 'kr' : 'us'} />

      {/* 종목명 + 티커 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {shortenName(item.name)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
          <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{item.ticker}</span>
          <span style={{
            fontSize: 9, padding: '0 4px', borderRadius: 3,
            background: isKR ? '#FF5A5A1A' : '#3B6EFF1A',
            color: isKR ? '#FF8585' : '#7BA3FF',
            border: `0.5px solid ${isKR ? '#FF5A5A33' : '#3B6EFF33'}`,
            fontWeight: 700,
          }}>
            {isKR ? 'KR' : 'US'}
          </span>
        </div>
      </div>

      {/* 등락률 */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {quote ? (
          <div style={{ fontSize: 12, fontWeight: 600, color: changeColor }}>
            {up ? '+' : ''}{quote.changePct.toFixed(2)}%
          </div>
        ) : (
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>—</div>
        )}
      </div>

      {/* 삭제 버튼 */}
      <button
        onClick={e => { e.stopPropagation(); remove(item.ticker) }}
        style={{
          background: 'none', border: 'none',
          color: hovered ? 'var(--color-text-secondary)' : 'transparent',
          cursor: 'pointer', fontSize: 13, padding: '2px 4px',
          transition: 'color .15s', flexShrink: 0,
        }}
      >
        ✕
      </button>
    </div>
  )
})

// ─── 트렌딩 섹터 컴포넌트 ────────────────────────────────────────

const SECTOR_ACCENT = ['#3B6EFF', '#1DB87A', '#F5A623'] as const

function TrendingsSkeleton() {
  return (
    <div style={{
      background: 'var(--color-background-primary)',
      borderBottom: '1px solid var(--color-border-tertiary)',
      padding: '14px 24px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{ width: 130, height: 18, borderRadius: 6, background: 'var(--color-background-secondary)' }} />
        <div style={{ width: 90, height: 14, borderRadius: 6, background: 'var(--color-background-secondary)' }} />
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            flex: '1 1 0', minWidth: 240, height: 128,
            background: 'var(--color-background-secondary)',
            border: '1px solid var(--color-border-tertiary)', borderRadius: 12,
          }} />
        ))}
      </div>
    </div>
  )
}

const TrendingSectorsSection = memo(function TrendingSectorsSection({
  data,
  navigate,
}: {
  data: TrendingSectorsData | null
  navigate: (path: string) => void
}) {
  if (!data) return <TrendingsSkeleton />

  const updatedStr = (() => {
    const d = new Date(data.updatedAt)
    return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  })()

  return (
    <div style={{
      background: 'var(--color-background-primary)',
      borderBottom: '1px solid var(--color-border-tertiary)',
      padding: '14px 24px 14px',
    }}>
      {/* 헤더 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 8, marginBottom: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>🔥 지금 뜨는 섹터</span>
          <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
            ETF 2개 평균 기반 · 갱신 {updatedStr}
          </span>
          {!data.geminiUsed && (
            <span style={{
              fontSize: 10, padding: '1px 7px', borderRadius: 8,
              background: 'rgba(245,166,35,0.12)', color: '#F5A623',
              border: '0.5px solid #F5A62350',
            }}>
              정적 데이터 (AI 미연결)
            </span>
          )}
        </div>
        {/* 연도별 테마 타임라인 */}
        {data.yearTimeline.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {data.yearTimeline.map((t, i) => (
              <div key={t.year} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {i > 0 && <span style={{ fontSize: 10, color: 'var(--color-border-primary)' }}>→</span>}
                <div style={{
                  fontSize: 11, padding: '2px 9px', borderRadius: 20,
                  background: t.active ? '#3B6EFF' : 'var(--color-background-secondary)',
                  color: t.active ? '#fff' : 'var(--color-text-secondary)',
                  fontWeight: t.active ? 700 : 400,
                  border: `1px solid ${t.active ? '#3B6EFF' : 'var(--color-border-secondary)'}`,
                  whiteSpace: 'nowrap',
                }}>
                  {t.year} {t.sector}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 섹터 카드 */}
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 2 }}>
        {data.sectors.map((sector, idx) => {
          const accent = SECTOR_ACCENT[idx % SECTOR_ACCENT.length]
          const retColor = sector.avgReturn1M >= 0 ? '#4ADE80' : '#FF5A5A'
          const hotnessLabel =
            sector.hotness === 'hot'    ? '🔥 HOT'   :
            sector.hotness === 'rising' ? '📈 급상승' : '📊 주목'
          const etfLabel = sector.etfsUsed.join('·')

          return (
            <div key={sector.primaryEtf} style={{
              flex: '1 1 0', minWidth: 240,
              background: 'var(--color-background-secondary)',
              border: '1px solid var(--color-border-tertiary)',
              borderTop: `2px solid ${accent}`,
              borderRadius: 12, padding: '12px 14px',
              display: 'flex', flexDirection: 'column', gap: 7,
            }}>
              {/* 카드 헤더 */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 20, lineHeight: 1 }}>{sector.sectorEmoji}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{sector.sectorName}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 1 }}>
                      {etfLabel} 평균
                      <span style={{ color: retColor, marginLeft: 5, fontWeight: 600 }}>
                        {sector.avgReturn1M > 0 ? '+' : ''}{sector.avgReturn1M.toFixed(1)}% (1M)
                      </span>
                    </div>
                  </div>
                </div>
                <span style={{
                  fontSize: 10, padding: '2px 7px', borderRadius: 8, flexShrink: 0,
                  background: accent + '22', color: accent,
                  border: `0.5px solid ${accent}55`, fontWeight: 700,
                }}>
                  {hotnessLabel}
                </span>
              </div>

              {/* 한줄 설명 */}
              <p style={{
                fontSize: 11, color: 'var(--color-text-secondary)',
                lineHeight: 1.55, margin: 0,
              }}>
                {sector.description}
              </p>

              {/* 종목 칩 */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 1 }}>
                {sector.stocks.map(stock => (
                  <button
                    key={stock.ticker}
                    onClick={() => navigate(`/stock/${stock.ticker}`)}
                    title={`${stock.name} — ${stock.reason}`}
                    style={{
                      padding: '2px 8px', borderRadius: 7,
                      background: stock.market === 'KR' ? 'rgba(245,166,35,0.10)' : 'rgba(59,110,255,0.10)',
                      border: `0.5px solid ${stock.market === 'KR' ? '#F5A62350' : '#3B6EFF50'}`,
                      color: stock.market === 'KR' ? '#F5A623' : '#7BA3FF',
                      fontSize: 11, fontWeight: 600,
                      cursor: 'pointer', transition: 'opacity 0.15s',
                      lineHeight: 1.6,
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.65' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1' }}
                  >
                    {stock.ticker}
                    <span style={{ fontWeight: 400, marginLeft: 3, opacity: 0.8 }}>{stock.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
})

// ─── 메인 페이지 ──────────────────────────────────────────────────
export default function HomePage() {
  const router = useRouter()

  const market = useMarketData()
  const { krOpen, usOpen } = useMarketStatus()
  const trendingSectors = useTrendingSectors()
  const [marketTab, setMarketTab] = useState<MarketTab>('us')
  const [sortMode,  setSortMode]  = useState<SortMode>('dollar')
  const { rankings, error: rankError, loading: rankLoading, refreshing: rankRefreshing, lastUpdated: rankLastUpdated } = useRankings(marketTab)
  const { watchlist, watchedSet, add: addToWatchlist, remove: removeTicker } = useWatchlist()
  const watchTickers = useMemo(() => watchlist.map(w => w.ticker), [watchlist])
  const { quotes: watchQuotes } = useWatchlistData(watchTickers)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newTicker,   setNewTicker]   = useState('')
  const [newName,     setNewName]     = useState('')
  const [adding,      setAdding]      = useState(false)
  const [addError,    setAddError]    = useState<string | null>(null)

  // [FIX 1] 안정된 navigate — router 자체가 안정된 참조이므로 deps=[router]로도 충분
  const navigate = useCallback((path: string) => router.push(path), [router])

  const sorted = useMemo(() => {
    if (!rankings) return null
    return [...rankings].sort((a, b) =>
      sortMode === 'dollar' ? b.dollarVolume - a.dollarVolume : b.volume - a.volume
    )
  }, [rankings, sortMode])

  const addManual = useCallback(async () => {
    const ticker = newTicker.trim().toUpperCase()
    if (!ticker) return
    setAdding(true); setAddError(null)
    const item = await addToWatchlist(ticker, newName || ticker)
    if (item) {
      setNewTicker(''); setNewName(''); setShowAddForm(false)
    } else {
      setAddError('추가 실패. 올바른 티커인지 확인해주세요.')
    }
    setAdding(false)
  }, [newTicker, newName, addToWatchlist])

  const toggleAddForm = useCallback(() => {
    setShowAddForm(v => !v); setAddError(null)
  }, [])

  return (
    <AuthGuard>
    <div style={{ minHeight: '100vh', background: 'var(--color-background-tertiary)', paddingBottom: 64, paddingTop: 48 }}>

      {/* ── 시장 상태 바 ── */}
      <div style={{
        background: 'var(--color-background-secondary)',
        borderBottom: '1px solid var(--color-border-tertiary)',
        padding: '0 24px', height: 34,
        display: 'flex', alignItems: 'center', gap: 20,
      }}>
        <StatusDot label="국내" hours="09:00~15:30 KST" active={krOpen} />
        <StatusDot label="해외" hours="09:30~16:00 ET"  active={usOpen} />
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-secondary)' }}>
          {marketTab === 'kr'
            ? '지수: Yahoo Finance · 순위·차트: 한국투자증권 · 5분 캐시'
            : '지수·순위: Yahoo Finance · 차트: Alpaca · 5분 캐시'}
        </span>
      </div>

      {/* ── 헤더 ── */}
      <header style={{
        background: 'var(--color-background-primary)',
        borderBottom: '1px solid var(--color-border-tertiary)',
        padding: '0 24px', height: 52,
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: 'linear-gradient(135deg, #3B6EFF, #7B3BFF)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
          }}>📈</div>
          <span style={{ fontSize: 16, fontWeight: 700 }}>주식 분석</span>
        </div>

        {/* 종목 검색 — 중앙 배치 */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <SearchBar />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <a href="/backtest" style={{
            fontSize: 12, color: 'var(--color-text-secondary)',
            textDecoration: 'none', padding: '5px 12px',
            border: '1px solid var(--color-border-secondary)',
            borderRadius: 6, transition: 'color 0.2s, border-color 0.2s',
          }}
            onMouseEnter={e => { (e.target as HTMLElement).style.color = '#ECEEF8'; (e.target as HTMLElement).style.borderColor = '#404880' }}
            onMouseLeave={e => { (e.target as HTMLElement).style.color = 'var(--color-text-secondary)'; (e.target as HTMLElement).style.borderColor = 'var(--color-border-secondary)' }}
          >
            백테스트
          </a>
          <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
            Gemini AI · Alpaca · 한국투자증권
          </span>
        </div>
      </header>

      {/* ── 시장 지표 카드 ── */}
      <div style={{
        background: 'var(--color-background-primary)',
        borderBottom: '1px solid var(--color-border-tertiary)',
        padding: '10px 24px',
        display: 'flex', gap: 8, overflowX: 'auto',
      }}>
        {MARKET_CONFIG.map(({ symbol, label, fmt, showChange }) => {
          const q       = market?.[symbol]
          const up      = q && q.changePct >= 0
          const chColor = up ? '#4ADE80' : '#FF5A5A'
          // [FIX 2] showChange: false 이더라도 changePct !== 0 이면 실제 등락 표시
          // (open.er-api.com 역사적 환율 조회 성공 시 자동 적용)
          const displayChange = showChange || (q != null && q.changePct !== 0)
          return (
            <div key={symbol} style={{
              background: 'var(--color-background-secondary)',
              border: '1px solid var(--color-border-tertiary)',
              borderRadius: 10, padding: '8px 14px', minWidth: 118, flexShrink: 0,
            }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                {q ? fmt(q.price) : '—'}
              </div>
              <div style={{ fontSize: 11, marginTop: 2 }}>
                {q == null
                  ? <span style={{ color: 'var(--color-border-primary)', fontSize: 10 }}>로딩 중…</span>
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

      {/* ── 지금 뜨는 섹터 ── */}
      <TrendingSectorsSection data={trendingSectors} navigate={navigate} />

      {/* ── 메인 콘텐츠 ── */}
      <main style={{
        maxWidth: 1440, margin: '0 auto', padding: '16px 24px',
        display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, alignItems: 'start',
      }}>

        {/* ── 좌: 랭킹 ── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            <div style={{
              display: 'flex', gap: 4,
              background: 'var(--color-background-secondary)',
              borderRadius: 22, padding: 3,
            }}>
              {MARKET_TABS.map(([tab, label]) => (
                <button
                  key={tab}
                  onClick={() => setMarketTab(tab)}
                  style={{
                    padding: '5px 14px', borderRadius: 18, border: 'none',
                    background: marketTab === tab ? 'var(--color-text-primary)' : 'transparent',
                    color: marketTab === tab ? 'var(--color-background-primary)' : 'var(--color-text-secondary)',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all .15s',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {SORT_MODES.map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => setSortMode(mode)}
                style={{
                  padding: '6px 14px', borderRadius: 20, border: 'none',
                  background: sortMode === mode ? '#3B6EFF22' : 'var(--color-background-secondary)',
                  color:      sortMode === mode ? '#7BA3FF'   : 'var(--color-text-secondary)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all .15s',
                }}
              >
                {label}
              </button>
            ))}

            {/* 마지막 갱신 시각 + 백그라운드 갱신 인디케이터 */}
            {rankLastUpdated && (
              <div style={{
                marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 11, color: 'var(--color-text-secondary)',
              }}>
                {rankRefreshing && (
                  <div style={{
                    width: 9, height: 9, borderRadius: '50%',
                    border: '1.5px solid var(--color-text-secondary)',
                    borderTopColor: '#7BA3FF',
                    animation: 'spin 0.8s linear infinite',
                    flexShrink: 0,
                  }} />
                )}
                {rankLastUpdated.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 기준
              </div>
            )}
          </div>

          <div style={{
            background: 'var(--color-background-primary)',
            border: '1px solid var(--color-border-tertiary)',
            borderRadius: 14, overflow: 'hidden',
          }}>
            {/* 컬럼 헤더 */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '44px 1fr 110px 80px 120px 40px',
              padding: '9px 16px',
              background: 'var(--color-background-secondary)',
              borderBottom: '1px solid var(--color-border-tertiary)',
            }}>
              {(['순위', '종목', '현재가', '등락률', sortMode === 'dollar' ? '거래대금' : '거래량', ''] as const)
                .map((h, i) => (
                  <span key={i} style={{
                    fontSize: 11, color: 'var(--color-text-secondary)',
                    textAlign: i >= 2 ? 'right' : 'left',
                  }}>{h}</span>
                ))}
            </div>

            {/* 로딩 */}
            {rankLoading && (
              <div style={{
                padding: '48px 0', textAlign: 'center',
                color: 'var(--color-text-secondary)', fontSize: 13,
              }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%', margin: '0 auto 12px',
                  border: '2px solid var(--color-border-secondary)',
                  borderTopColor: 'var(--color-text-primary)',
                  animation: 'spin 0.7s linear infinite',
                }} />
                랭킹 데이터 로딩 중…
              </div>
            )}

            {/* 에러 */}
            {!rankLoading && rankError && (
              <div style={{
                padding: '32px 24px', textAlign: 'center',
                color: 'var(--color-error-text)', fontSize: 13,
              }}>
                ⚠️ {rankError}
              </div>
            )}

            {/* [FIX 3] 장외 시간 / 데이터 없음 — 빈 배열 케이스 */}
            {!rankLoading && !rankError && sorted && sorted.length === 0 && (
              <div style={{
                padding: '48px 0', textAlign: 'center',
                color: 'var(--color-text-secondary)', fontSize: 13,
              }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>📊</div>
                <div style={{ marginBottom: 4 }}>
                  {marketTab === 'kr' ? '한국 시장 데이터가 없습니다' : '미국 시장 데이터가 없습니다'}
                </div>
                <div style={{ fontSize: 11 }}>
                  {marketTab === 'kr'
                    ? '장외 시간(15:30 이후)이거나 API 한도 초과일 수 있습니다'
                    : '시장 휴장 또는 API 응답이 없습니다'}
                </div>
              </div>
            )}

            {/* 랭킹 행 — [FIX 1] navigate 안정된 참조 전달 */}
            {sorted?.map((item, idx) => (
              <RankingRow
                key={item.symbol}
                item={item}
                rank={idx + 1}
                sortMode={sortMode}
                marketTab={marketTab}
                isWatched={watchedSet.has(item.symbol)}
                onWatch={addToWatchlist}
                navigate={navigate}
              />
            ))}
          </div>
        </div>

        {/* ── 우: 관심종목 사이드바 ── */}
        <div style={{ position: 'sticky', top: 16 }}>
          <div style={{
            background: 'var(--color-background-primary)',
            border: '1px solid var(--color-border-tertiary)',
            borderRadius: 14, overflow: 'hidden',
          }}>
            {/* 헤더 */}
            <div style={{
              padding: '14px 16px',
              borderBottom: '1px solid var(--color-border-tertiary)',
              background: 'var(--color-background-secondary)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>관심종목</span>
                <span style={{
                  fontSize: 11, padding: '1px 7px', borderRadius: 10,
                  background: 'var(--color-background-primary)',
                  color: 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border-secondary)',
                }}>
                  {watchlist.length}
                </span>
              </div>
              <button
                onClick={toggleAddForm}
                style={{
                  padding: '4px 12px', borderRadius: 14, border: 'none',
                  background: showAddForm ? 'var(--color-border-secondary)' : '#3B6EFF',
                  color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}
              >
                {showAddForm ? '취소' : '+ 추가'}
              </button>
            </div>

            {/* 추가 폼 */}
            {showAddForm && (
              <div style={{
                padding: '12px 14px',
                borderBottom: '1px solid var(--color-border-tertiary)',
                background: 'var(--color-background-secondary)',
              }}>
                <input
                  value={newTicker}
                  onChange={e => { setNewTicker(e.target.value.toUpperCase()); setAddError(null) }}
                  onKeyDown={e => e.key === 'Enter' && addManual()}
                  placeholder="티커  예) AAPL · 005930"
                  autoFocus
                  style={{
                    width: '100%', padding: '7px 10px', borderRadius: 7, marginBottom: 6,
                    border: `1px solid ${addError ? 'var(--color-error-border)' : 'var(--color-border-secondary)'}`,
                    background: 'var(--color-background-primary)',
                    color: 'var(--color-text-primary)', fontSize: 12, outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="종목명 (선택)"
                    style={{
                      flex: 1, padding: '7px 10px', borderRadius: 7,
                      border: '1px solid var(--color-border-secondary)',
                      background: 'var(--color-background-primary)',
                      color: 'var(--color-text-primary)', fontSize: 12, outline: 'none',
                    }}
                  />
                  <button
                    onClick={addManual}
                    disabled={adding || !newTicker.trim()}
                    style={{
                      padding: '7px 14px', borderRadius: 7, border: 'none',
                      background: adding || !newTicker.trim() ? 'var(--color-border-secondary)' : '#3B6EFF',
                      color: '#fff', fontSize: 12, fontWeight: 600,
                      cursor: adding || !newTicker.trim() ? 'not-allowed' : 'pointer',
                      opacity: adding || !newTicker.trim() ? 0.5 : 1,
                    }}
                  >
                    {adding ? '…' : '추가'}
                  </button>
                </div>
                {addError && (
                  <div style={{ marginTop: 6, fontSize: 11, color: 'var(--color-error-text)' }}>
                    {addError}
                  </div>
                )}
              </div>
            )}

            {/* [FIX 4] 관심종목 목록 — maxHeight로 넘침 방지 */}
            <div style={{ maxHeight: 480, overflowY: 'auto' }}>
              {watchlist.length === 0 ? (
                <div style={{
                  padding: '40px 16px', textAlign: 'center',
                  color: 'var(--color-text-secondary)', fontSize: 12,
                }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>🔍</div>
                  종목을 추가하거나<br />랭킹에서 ♡ 를 눌러보세요
                </div>
              ) : (
                // [FIX 1] navigate/remove를 안정된 참조로 전달
                watchlist.map((item, idx) => (
                  <SidebarItem
                    key={item.id}
                    item={item}
                    isLast={idx === watchlist.length - 1}
                    navigate={navigate}
                    remove={removeTicker}
                    quote={watchQuotes[item.ticker] ?? null}
                  />
                ))
              )}
            </div>
          </div>
        </div>

      </main>
    </div>
    </AuthGuard>
  )
}
