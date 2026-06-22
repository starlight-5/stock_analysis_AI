'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import StockChart from '@/components/StockChart'
import StrategyPanel from '@/components/StrategyPanel'
import IndicatorExplainer from '@/components/IndicatorExplainer'
import type { OHLCVBar, Indicators, StrategyResult, IndicatorSnapshot } from '@/types/stock'

function deriveSnapshot(bars: OHLCVBar[], ind: Indicators): IndicatorSnapshot {
  const last = (arr: (number | null)[]) => arr[arr.length - 1] ?? null
  const close = bars[bars.length - 1].close
  const bbUpper = last(ind.bollinger.upper)
  const bbLower = last(ind.bollinger.lower)
  const ma5  = last(ind.ma.ma5)
  const ma20 = last(ind.ma.ma20)
  return {
    close,
    rsi:       last(ind.rsi),
    macd:      last(ind.macd.macdLine),
    signal:    last(ind.macd.signalLine),
    histogram: last(ind.macd.histogram),
    bbUpper,
    bbMid:     last(ind.bollinger.mid),
    bbLower,
    bbPosition: bbUpper != null && bbLower != null && bbUpper !== bbLower
      ? (close - bbLower) / (bbUpper - bbLower) : null,
    ma5, ma20,
    ma60:  last(ind.ma.ma60),
    ma120: last(ind.ma.ma120),
    volumeRatio: ind.volumeRatio,
    maCrossState: ma5 != null && ma20 != null
      ? ma5 > ma20 ? 'golden' : ma5 < ma20 ? 'dead' : 'neutral'
      : 'neutral',
  }
}

const SOURCE_LABEL: Record<string, string> = {
  alpaca:           'Alpaca',
  korea_investment: '한국투자증권',
  mock:             '데모 데이터',
}

export default function StockDetailPage() {
  const params = useParams()
  const ticker = (params?.ticker as string ?? '').toUpperCase()

  const [bars, setBars]               = useState<OHLCVBar[]>([])
  const [indicators, setInd]          = useState<Indicators | null>(null)
  const [dataSource, setSource]       = useState<string>('')
  const [loadingData, setLoadingData] = useState(true)
  const [dataError, setDataError]     = useState<string | null>(null)

  const [strategy, setStrategy]       = useState<StrategyResult | null>(null)
  const [snapshot, setSnapshot]       = useState<IndicatorSnapshot | null>(null)
  const [analyzing, setAnalyzing]     = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [isFallback, setIsFallback]   = useState(false)
  const [fromCache, setFromCache]     = useState(false)

  useEffect(() => {
    if (!ticker) return
    setLoadingData(true)
    setDataError(null)

    fetch(`/api/stock?ticker=${ticker}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setBars(data.bars)
        setInd(data.indicators)
        setSource(data.source)
      })
      .catch((e) => setDataError(e.message))
      .finally(() => setLoadingData(false))
  }, [ticker])

  const runAnalyze = useCallback(async (force = false) => {
    setAnalyzing(true)
    setAnalyzeError(null)
    setIsFallback(false)
    try {
      const res = await fetch('/api/strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker, forceRefresh: force }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setStrategy(data.strategy)
      setSnapshot(data.snapshot)
      setIsFallback(!!data.fallbackMode)
      setFromCache(!!data.fromCache)
    } catch (e: any) {
      setAnalyzeError(`분석에 실패했습니다: ${e.message}`)
    } finally {
      setAnalyzing(false)
    }
  }, [ticker])

  const handleAnalyze = useCallback(() => runAnalyze(false), [runAnalyze])
  const handleForceRefresh = useCallback(() => runAnalyze(true), [runAnalyze])

  const buyEntries = strategy?.buyStrategy.entries.map((e, i) => ({
    price: e.price,
    label: strategy.buyStrategy.type === 'split' ? `매수${i + 1}` : '매수',
  })) ?? []

  const sellTargets = strategy?.sellStrategy.targets.map((t, i) => ({
    price: t.price,
    label: `목표${i + 1}`,
  })) ?? []

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background-tertiary)' }}>
      <header style={{
        background: 'var(--color-background-primary)',
        borderBottom: '0.5px solid var(--color-border-tertiary)',
        padding: '0 24px', height: 52,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <a href="/" style={{ color: 'var(--color-text-secondary)', fontSize: 13, textDecoration: 'none' }}>
            ← 목록
          </a>
          <span style={{ fontSize: 16, fontWeight: 500 }}>{ticker}</span>
          {dataSource && (
            <span style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 10,
              background: dataSource === 'mock' ? '#FAEEDA' : 'var(--color-background-secondary)',
              color: dataSource === 'mock' ? '#633806' : 'var(--color-text-secondary)',
            }}>
              {SOURCE_LABEL[dataSource] ?? dataSource}
            </span>
          )}
        </div>
      </header>

      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '20px 24px' }}>
        {/* 데이터 에러 */}
        {dataError && (
          <div style={{
            padding: '14px 16px', marginBottom: 16,
            background: 'var(--color-error-bg)', border: '0.5px solid var(--color-error-border)',
            borderRadius: 8, color: 'var(--color-error-text)', fontSize: 13, lineHeight: 1.6,
          }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>⚠️ 데이터 로드 실패</div>
            <div>{dataError}</div>
            {/한투|KOREA|KI|토큰|403|401/i.test(dataError) && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-warning-text)' }}>
                💡 한국투자증권 API 오류입니다.{' '}
                {/EGW00133/.test(dataError)
                  ? '1분 후 다시 시도해주세요 (토큰 발급 rate limit).'
                  : '.env.local의 KOREA_INVESTMENT_MODE=mock 설정 또는 API 키를 확인해주세요.'}
              </div>
            )}
          </div>
        )}

        {/* 분석 에러 */}
        {analyzeError && (
          <div style={{
            padding: '12px 16px', marginBottom: 16,
            background: 'var(--color-error-bg)', border: '0.5px solid var(--color-error-border)',
            borderRadius: 8, color: 'var(--color-error-text)', fontSize: 13,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>{analyzeError}</span>
            <button
              onClick={() => setAnalyzeError(null)}
              style={{ background: 'none', border: 'none', color: 'var(--color-error-text)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
            >
              ✕
            </button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16, alignItems: 'start' }}>
          {/* 차트 */}
          <div style={{
            background: 'var(--color-background-primary)',
            border: '0.5px solid var(--color-border-tertiary)',
            borderRadius: 12, padding: '20px',
          }}>
            {loadingData ? (
              <div style={{ height: 340, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%',
                  border: '2px solid var(--color-border-secondary)',
                  borderTopColor: 'var(--color-text-primary)',
                  animation: 'spin 0.7s linear infinite',
                }} />
                <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>데이터 로딩 중…</span>
              </div>
            ) : indicators && bars.length > 0 ? (
              <>
                <StockChart
                  bars={bars}
                  indicators={indicators}
                  buyEntries={buyEntries}
                  sellTargets={sellTargets}
                  stopLoss={strategy?.buyStrategy.stopLoss}
                />
                <IndicatorExplainer snap={snapshot ?? deriveSnapshot(bars, indicators)} />
              </>
            ) : (
              <div style={{ height: 340, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <span style={{ fontSize: 32 }}>📭</span>
                <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>데이터를 불러올 수 없습니다</span>
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>지원하지 않는 티커이거나 API 오류일 수 있습니다</span>
              </div>
            )}
          </div>

          {/* 전략 패널 */}
          <StrategyPanel
            ticker={ticker}
            strategy={strategy}
            snapshot={snapshot}
            isLoading={analyzing}
            isFallback={isFallback}
            fromCache={fromCache}
            onAnalyze={handleAnalyze}
            onForceRefresh={handleForceRefresh}
          />
        </div>
      </main>
    </div>
  )
}
