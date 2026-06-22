import { NextRequest, NextResponse } from 'next/server'
import { fetchStockData } from '@/lib/dataSource'
import { calcIndicators, getSnapshot } from '@/lib/indicators'
import type { OHLCVBar, IndicatorSnapshot } from '@/types/stock'

const TX_COST = 0.0025 // 0.25% per trade (매수/매도 각각)
const MIN_BARS = 35    // MACD signal(9) + slow(26) = 35일 최소 필요

function getSignal(snap: IndicatorSnapshot): 'strong_buy' | 'buy' | 'watch' | 'sell' | 'strong_sell' {
  const rsi   = snap.rsi   ?? 50
  const bbPos = snap.bbPosition ?? 0.5

  if (rsi < 30 || bbPos < 0.15) return 'strong_buy'
  if (rsi < 45 || bbPos < 0.35) return 'buy'
  if (rsi > 70 || bbPos > 0.85) return 'strong_sell'
  if (rsi > 58 || bbPos > 0.65) return 'sell'
  return 'watch'
}

function snapshotFromSubset(bars: OHLCVBar[]): IndicatorSnapshot {
  const ind = calcIndicators(bars)
  return getSnapshot(bars, ind)
}

export async function POST(req: NextRequest) {
  try {
    const body           = await req.json()
    const ticker         = (body.ticker as string)?.toUpperCase()
    const initialCapital = Number(body.initialCapital ?? 10_000_000)

    if (!ticker) {
      return NextResponse.json({ error: 'ticker 필드 필요' }, { status: 400 })
    }

    const { bars } = await fetchStockData(ticker)
    if (bars.length < MIN_BARS) {
      return NextResponse.json(
        { error: `데이터 부족 — 최소 ${MIN_BARS}일 필요 (현재 ${bars.length}일)` },
        { status: 400 },
      )
    }

    // ── 1. 워크포워드(Walk-forward) 시그널 계산 ─────────────────
    // 각 날짜에서 그날까지의 데이터만 보고 시그널을 결정합니다.
    const signals: string[] = bars.map((_, i) => {
      if (i < MIN_BARS - 1) return 'watch'
      return getSignal(snapshotFromSubset(bars.slice(0, i + 1)))
    })

    // ── 2. 거래 시뮬레이션 ────────────────────────────────────────
    // 전날 시그널 → 오늘 시가에 매수/매도 체결 (현실적 지연 반영)
    type TradeOpen = {
      entryDate: string
      entryPrice: number
      shares: number
    }

    let state: 'CASH' | 'INVESTED' = 'CASH'
    let cash   = initialCapital
    let shares = 0
    let peak   = initialCapital
    let maxDD  = 0

    const openTrades: TradeOpen[] = []
    const closedTrades: {
      entryDate: string
      entryPrice: number
      exitDate: string
      exitPrice: number
      returnPct: number
      profitLoss: number
      holdingDays: number
    }[] = []

    const dailyPortfolio: {
      date: string
      strategyValue: number
      buyHoldValue: number
      signal: string
      close: number
      action: 'buy' | 'sell' | null
    }[] = []

    const firstClose = bars[0].close

    for (let i = 0; i < bars.length; i++) {
      const bar       = bars[i]
      const prevSig   = i > 0 ? signals[i - 1] : 'watch'
      const todayOpen = bar.open
      let action: 'buy' | 'sell' | null = null

      // 전날 시그널에 따라 오늘 시가 체결
      if (i > 0) {
        if (state === 'CASH' && (prevSig === 'strong_buy' || prevSig === 'buy')) {
          const cost = todayOpen * (1 + TX_COST)
          shares = cash / cost
          cash   = 0
          state  = 'INVESTED'
          action = 'buy'
          openTrades.push({ entryDate: bar.date, entryPrice: todayOpen, shares })
        } else if (state === 'INVESTED' && (prevSig === 'strong_sell' || prevSig === 'sell')) {
          const proceeds = shares * todayOpen * (1 - TX_COST)
          const lastOpen  = openTrades[openTrades.length - 1]
          const entryDate = new Date(lastOpen.entryDate)
          const exitDate  = new Date(bar.date)
          closedTrades.push({
            entryDate:   lastOpen.entryDate,
            entryPrice:  lastOpen.entryPrice,
            exitDate:    bar.date,
            exitPrice:   todayOpen,
            returnPct:   Number(((todayOpen - lastOpen.entryPrice) / lastOpen.entryPrice * 100).toFixed(2)),
            profitLoss:  Number((proceeds - lastOpen.shares * lastOpen.entryPrice).toFixed(0)),
            holdingDays: Math.round((exitDate.getTime() - entryDate.getTime()) / 86400000),
          })
          cash   = proceeds
          shares = 0
          state  = 'CASH'
          action = 'sell'
        }
      }

      // 당일 종가 기준 포트폴리오 가치
      const portValue = state === 'CASH' ? cash : shares * bar.close
      if (portValue > peak) peak = portValue
      const dd = (peak - portValue) / peak * 100
      if (dd > maxDD) maxDD = dd

      dailyPortfolio.push({
        date:          bar.date,
        strategyValue: Math.round(portValue),
        buyHoldValue:  Math.round((bar.close / firstClose) * initialCapital),
        signal:        signals[i],
        close:         bar.close,
        action,
      })
    }

    // 마지막 미청산 포지션 → 최종 종가로 강제 청산
    if (state === 'INVESTED' && openTrades.length > 0) {
      const lastBar   = bars[bars.length - 1]
      const proceeds  = shares * lastBar.close * (1 - TX_COST)
      const lastOpen  = openTrades[openTrades.length - 1]
      const entryDate = new Date(lastOpen.entryDate)
      const exitDate  = new Date(lastBar.date)
      closedTrades.push({
        entryDate:   lastOpen.entryDate,
        entryPrice:  lastOpen.entryPrice,
        exitDate:    lastBar.date,
        exitPrice:   lastBar.close,
        returnPct:   Number(((lastBar.close - lastOpen.entryPrice) / lastOpen.entryPrice * 100).toFixed(2)),
        profitLoss:  Number((proceeds - lastOpen.shares * lastOpen.entryPrice).toFixed(0)),
        holdingDays: Math.round((exitDate.getTime() - entryDate.getTime()) / 86400000),
      })
      cash = proceeds
    }

    // ── 3. 성과 지표 계산 ─────────────────────────────────────────
    const finalCapital    = Math.round(cash)
    const totalReturn     = Number(((finalCapital - initialCapital) / initialCapital * 100).toFixed(2))
    const winRate         = closedTrades.length > 0
      ? Number((closedTrades.filter(t => t.returnPct > 0).length / closedTrades.length * 100).toFixed(1))
      : 0

    // 일간 수익률 기반 샤프 지수 (연환산)
    let sharpeRatio: number | null = null
    if (dailyPortfolio.length > 10) {
      const rets: number[] = []
      for (let i = 1; i < dailyPortfolio.length; i++) {
        const p = dailyPortfolio[i - 1].strategyValue
        const c = dailyPortfolio[i].strategyValue
        if (p > 0) rets.push((c - p) / p)
      }
      const mean = rets.reduce((a, b) => a + b, 0) / rets.length
      const std  = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length)
      if (std > 0) sharpeRatio = Number(((mean / std) * Math.sqrt(252)).toFixed(2))
    }

    // Buy & Hold 최대낙폭
    let bhPeak = initialCapital
    let bhMaxDD = 0
    for (const d of dailyPortfolio) {
      if (d.buyHoldValue > bhPeak) bhPeak = d.buyHoldValue
      const dd = (bhPeak - d.buyHoldValue) / bhPeak * 100
      if (dd > bhMaxDD) bhMaxDD = dd
    }

    const lastBar   = bars[bars.length - 1]
    const bhFinal   = Math.round((lastBar.close / firstClose) * initialCapital)
    const bhReturn  = Number(((bhFinal - initialCapital) / initialCapital * 100).toFixed(2))

    return NextResponse.json({
      ticker,
      period: {
        start:       bars[0].date,
        end:         lastBar.date,
        tradingDays: bars.length,
      },
      initialCapital,
      txCostPct: TX_COST * 100,
      strategy: {
        finalCapital,
        totalReturn,
        maxDrawdown:  Number(maxDD.toFixed(2)),
        numTrades:    openTrades.length,
        winRate,
        sharpeRatio,
      },
      buyAndHold: {
        finalCapital: bhFinal,
        totalReturn:  bhReturn,
        maxDrawdown:  Number(bhMaxDD.toFixed(2)),
      },
      trades:         closedTrades,
      dailyPortfolio,
    })
  } catch (e: any) {
    console.error('[backtest]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
