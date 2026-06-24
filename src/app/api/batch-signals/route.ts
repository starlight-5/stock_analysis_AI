import { NextRequest, NextResponse } from 'next/server'
import { fetchStockData } from '@/lib/dataSource'
import { calcIndicators, getSnapshot } from '@/lib/indicators'
import type { StrategyResult } from '@/types/stock'

type Signal = StrategyResult['signal']

const CACHE_TTL = 30 * 60 * 1000
;(globalThis as any).__batchSignalCache ??= new Map()
const signalCache: Map<string, { signal: Signal; exp: number }> =
  (globalThis as any).__batchSignalCache

function deriveSignal(rsi: number, bbPos: number): Signal {
  if (rsi < 30 || bbPos < 0.15) return 'strong_buy'
  if (rsi < 45 || bbPos < 0.35) return 'buy'
  if (rsi > 70 || bbPos > 0.85) return 'strong_sell'
  if (rsi > 58 || bbPos > 0.65) return 'sell'
  return 'watch'
}

async function getSignal(ticker: string): Promise<Signal | null> {
  const cached = signalCache.get(ticker)
  if (cached && Date.now() < cached.exp) return cached.signal

  try {
    const { bars } = await fetchStockData(ticker)
    if (bars.length < 20) return null

    const indicators = calcIndicators(bars)
    const snap       = getSnapshot(bars, indicators)

    const signal = deriveSignal(snap.rsi ?? 50, snap.bbPosition ?? 0.5)
    signalCache.set(ticker, { signal, exp: Date.now() + CACHE_TTL })
    return signal
  } catch {
    return null
  }
}

// POST /api/batch-signals  body: { tickers: string[] }
export async function POST(req: NextRequest) {
  const body    = await req.json().catch(() => ({}))
  const tickers: string[] = Array.isArray(body.tickers) ? body.tickers : []
  if (!tickers.length) return NextResponse.json({})

  const entries = await Promise.allSettled(
    tickers.map(async t => [t, await getSignal(t)] as const)
  )

  const result: Record<string, Signal | null> = {}
  for (const entry of entries) {
    if (entry.status === 'fulfilled') {
      const [ticker, signal] = entry.value
      result[ticker] = signal
    }
  }
  return NextResponse.json(result)
}
