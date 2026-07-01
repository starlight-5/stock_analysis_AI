'use client'
/**
 * HomePage (대시보드 메인 페이지)
 *
 * 주요 구조:
 *   - AuthGuard: 로그인 세션 필수 처리
 *   - fixed header: MarketStatusBar(스크롤 감지하여 접힘) + 검색 바를 포함한 header
 *   - MarketIndicesBar: 주요 지수 및 감성 요약
 *   - TrendingSectorsSection: Gemini 추천 뜨는 섹터
 *   - 메인 그리드 레이아웃:
 *     - 왼쪽: RankingTable (미국/한국 랭킹 순위 및 관심종목 추가 버튼)
 *     - 오른쪽: WatchlistPanel (사용자 관심종목 및 실시간 시세 조회)
 *
 * 시세 갱신:
 *   - useRefreshTick을 통해 시계 5분 단위에 맞추어 모든 시세(지수, 관심종목, 랭킹)가 동시에 갱신됨
 */

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useScrollDirection } from '@/hooks/useScrollDirection'
import AuthGuard from '@/components/AuthGuard'
import SearchBar from '@/components/SearchBar'
import MarketStatusBar from '@/components/MarketStatusBar'
import MarketIndicesBar from '@/components/MarketIndicesBar'
import TrendingSectorsSection from '@/components/TrendingSectorsSection'
import RankingTable from '@/components/RankingTable'
import WatchlistPanel from '@/components/WatchlistPanel'
import { useMarketData } from '@/hooks/useMarketData'
import { useMarketStatus } from '@/hooks/useMarketStatus'
import { useRankings } from '@/hooks/useRankings'
import { useWatchlist } from '@/hooks/useWatchlist'
import { useWatchlistData } from '@/hooks/useWatchlistData'
import { useTrendingSectors } from '@/hooks/useTrendingSectors'
import type { SortMode, MarketTab } from '@/types/market'

export default function HomePage() {
  const router = useRouter()

  const market          = useMarketData()
  const { krOpen, usOpen } = useMarketStatus()
  const trendingSectors = useTrendingSectors()

  const [marketTab, setMarketTab] = useState<MarketTab>('us')
  const [sortMode,  setSortMode]  = useState<SortMode>('dollar')

  const {
    rankings, error: rankError, loading: rankLoading,
    refreshing: rankRefreshing, lastUpdated: rankLastUpdated,
  } = useRankings(marketTab)

  const { watchlist, watchedSet, add: addToWatchlist, remove: removeTicker, loading: watchlistLoading } = useWatchlist()
  const watchTickers = useMemo(() => watchlist.map(w => w.ticker), [watchlist])
  const { quotes: watchQuotes } = useWatchlistData(watchTickers)

  const scrollDir = useScrollDirection()

  // [FIX 1] 안정된 navigate — router 자체가 안정된 참조이므로 deps=[router]로도 충분
  const navigate = useCallback((path: string) => router.push(path), [router])

  const sorted = useMemo(() => {
    if (!rankings) return null
    return [...rankings].sort((a, b) =>
      sortMode === 'dollar' ? b.dollarVolume - a.dollarVolume : b.volume - a.volume
    )
  }, [rankings, sortMode])

  return (
    <AuthGuard>
      {/* ── Fixed header area (상태바 + 헤더) ── */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100 }}>
        {/* 시장 상태 바 — 아래 스크롤 시 height 0으로 접힘 */}
        <div style={{
          height: scrollDir === 'down' ? 0 : 34,
          overflow: 'hidden',
          transition: 'height 0.2s ease',
        }}>
          <MarketStatusBar krOpen={krOpen} usOpen={usOpen} marketTab={marketTab} />
        </div>
        {/* 헤더 — 항상 고정 */}
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
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            <SearchBar />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
              Gemini AI · Alpaca · 한국투자증권
            </span>
          </div>
        </header>
      </div>

      {/* ── 스크롤 콘텐츠 (fixed header 높이만큼 상단 여백) ── */}
      <div style={{ minHeight: '100vh', background: 'var(--color-background-tertiary)', paddingBottom: 64, paddingTop: 86 }}>

        {/* ── 시장 지표 카드 ── */}
        <MarketIndicesBar market={market} />

        {/* ── 지금 뜨는 섹터 ── */}
        <TrendingSectorsSection data={trendingSectors} navigate={navigate} />

        {/* ── 메인 콘텐츠 ── */}
        <main style={{
          maxWidth: 1440, margin: '0 auto', padding: '16px 24px',
          display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, alignItems: 'start',
        }}>
          {/* ── 좌: 랭킹 ── */}
          <RankingTable
            sorted={sorted}
            loading={rankLoading}
            error={rankError}
            refreshing={rankRefreshing}
            lastUpdated={rankLastUpdated}
            marketTab={marketTab}
            setMarketTab={setMarketTab}
            sortMode={sortMode}
            setSortMode={setSortMode}
            watchedSet={watchedSet}
            addToWatchlist={addToWatchlist}
            navigate={navigate}
          />

          {/* ── 우: 관심종목 사이드바 ── */}
          <WatchlistPanel
            watchlist={watchlist}
            watchQuotes={watchQuotes}
            navigate={navigate}
            remove={removeTicker}
            addToWatchlist={addToWatchlist}
            loading={watchlistLoading}
          />
        </main>

      </div>
    </AuthGuard>
  )
}
