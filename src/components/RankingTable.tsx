'use client'
/**
 * RankingTable
 * 미국/한국 종목 랭킹(거래량·거래대금 순위)을 테이블로 표시하는 컴포넌트.
 * 하트 버튼으로 관심종목 추가, 행 클릭으로 종목 상세 페이지 이동,
 * Skeleton shimmer로 로딩 상태를 처리한다.
 * React.memo로 랭킹 행 단위 리렌더를 최소화한다.
 */
import { useState, useCallback, memo } from 'react'
import TickerIcon from '@/components/TickerIcon'
import SkeletonBox from '@/components/SkeletonBox'
import type { SortMode, MarketTab } from '@/types/market'
import type { RankingItem } from '@/app/api/rankings/route'
import type { WatchlistItem } from '@/types/stock'

function RankingRowSkeleton() {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '44px 1fr 110px 80px 120px 40px',
      alignItems: 'center',
      padding: '10px 16px',
      borderBottom: '1px solid var(--color-border-tertiary)',
    }}>
      <SkeletonBox width={20} height={14} borderRadius={4} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <SkeletonBox width={34} height={34} borderRadius={10} style={{ flexShrink: 0 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
          <SkeletonBox width="55%" height={13} borderRadius={4} />
          <SkeletonBox width="30%" height={10} borderRadius={4} />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <SkeletonBox width={72} height={13} borderRadius={4} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <SkeletonBox width={44} height={13} borderRadius={4} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <SkeletonBox width={64} height={12} borderRadius={4} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <SkeletonBox width={18} height={18} borderRadius={4} />
      </div>
    </div>
  )
}

const MARKET_TABS: [MarketTab, string][] = [['us', '🇺🇸 US'], ['kr', '🇰🇷 한국']]
const SORT_MODES:  [SortMode, string][]  = [['dollar', '거래대금 순'], ['volume', '거래량 순']]

const NAME_SUFFIXES = /\s+(Inc\.?|Corp\.?|Corporation|Holdings?|Ltd\.?|Limited|Co\.?|Group|Plc\.?|N\.V\.?|S\.A\.?|Class\s+[A-C]|Ordinary\s+Shares?)\s*$/gi

function shortenName(name: string): string {
  return name.replace(NAME_SUFFIXES, '').replace(/[,.\s]+$/, '').trim()
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

/**
 * [FIX 1] onNavigate 클로저 제거 — navigate(path) + symbol prop 방식으로 변경.
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
  const [addFailed, setAddFailed] = useState(false)
  const up = item.changePct >= 0
  const changeColor = up ? 'var(--color-positive)' : 'var(--color-negative)'
  const isKR = marketTab === 'kr'

  const doWatch = useCallback(async () => {
    if (isWatched || addFailed) return
    const result = await onWatch(item.symbol, item.name)
    if (!result) {
      setAddFailed(true)
      setTimeout(() => setAddFailed(false), 2000)
    }
  }, [isWatched, addFailed, onWatch, item.symbol, item.name])

  const handleWatch = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    doWatch()
  }, [doWatch])

  const handleWatchKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      e.stopPropagation()
      doWatch()
    }
  }, [doWatch])

  return (
    <div
      onClick={() => navigate(`/stock/${item.symbol}`)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/stock/${item.symbol}`) } }}
      role="button"
      tabIndex={0}
      className="focusable"
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
        color: rank <= 3 ? 'var(--color-accent-primary)' : rank <= 10 ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
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

      <div
        onClick={handleWatch}
        onKeyDown={handleWatchKey}
        role="button"
        tabIndex={0}
        className="focusable"
        style={{ display: 'flex', justifyContent: 'center' }}
      >
        <span
          title={addFailed ? '추가 실패 (이미 등록됐거나 오류)' : isWatched ? '관심 등록됨' : '관심 추가'}
          style={{
            fontSize: 16,
            cursor: isWatched || addFailed ? 'default' : 'pointer',
            color: addFailed ? '#F5A623' : isWatched ? 'var(--color-negative)' : 'var(--color-border-primary)',
            transition: 'color .15s', userSelect: 'none',
          }}
        >
          {addFailed ? '✕' : isWatched ? '♥' : '♡'}
        </span>
      </div>
    </div>
  )
})

export default function RankingTable({
  sorted, loading, error, refreshing, lastUpdated,
  marketTab, setMarketTab, sortMode, setSortMode,
  watchedSet, addToWatchlist, navigate,
}: {
  sorted: RankingItem[] | null
  loading: boolean
  error: string | null
  refreshing: boolean
  lastUpdated: Date | null
  marketTab: MarketTab
  setMarketTab: (tab: MarketTab) => void
  sortMode: SortMode
  setSortMode: (mode: SortMode) => void
  watchedSet: Set<string>
  addToWatchlist: (ticker: string, name: string) => Promise<WatchlistItem | null>
  navigate: (path: string) => void
}) {
  return (
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
              color:      sortMode === mode ? 'var(--color-info-text)' : 'var(--color-text-secondary)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all .15s',
            }}
          >
            {label}
          </button>
        ))}

        {/* 마지막 갱신 시각 + 백그라운드 갱신 인디케이터 */}
        {lastUpdated && (
          <div style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 11, color: 'var(--color-text-secondary)',
          }}>
            {refreshing && (
              <div style={{
                width: 9, height: 9, borderRadius: '50%',
                border: '1.5px solid var(--color-text-secondary)',
                borderTopColor: 'var(--color-info-text)',
                animation: 'spin 0.8s linear infinite',
                flexShrink: 0,
              }} />
            )}
            {lastUpdated.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 기준
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

        {/* 로딩 — 스켈레톤 행 */}
        {loading && Array.from({ length: 10 }, (_, i) => <RankingRowSkeleton key={i} />)}

        {/* 에러 */}
        {!loading && error && (
          <div style={{
            padding: '32px 24px', textAlign: 'center',
            color: 'var(--color-error-text)', fontSize: 13,
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* [FIX 3] 장외 시간 / 데이터 없음 — 빈 배열 케이스 */}
        {!loading && !error && sorted && sorted.length === 0 && (
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
  )
}
