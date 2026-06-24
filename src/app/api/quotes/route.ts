import { NextRequest, NextResponse } from 'next/server'

export type QuoteData = {
  price: number
  change: number
  changePct: number
}

const CACHE_TTL = 5 * 60 * 1000
;(globalThis as any).__quoteCache = new Map()
const quoteCache: Map<string, { data: QuoteData; exp: number }> = (globalThis as any).__quoteCache

async function fetchQuote(ticker: string): Promise<QuoteData | null> {
  const cached = quoteCache.get(ticker)
  if (cached && Date.now() < cached.exp) return cached.data

  const symbol = /^\d{6}$/.test(ticker) ? `${ticker}.KS` : ticker
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=5d`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(8000),
      }
    )
    const json = await res.json()
    const result = json.chart?.result?.[0]
    if (!result) return null

    const price = result.meta?.regularMarketPrice ?? null
    if (price == null) return null

    // closes[-2]가 실제 전일 종가로 가장 신뢰도 높음
    // chartPreviousClose는 Yahoo Finance 버그로 잘못된 값이 오는 경우 있음
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? []
    const validCloses = closes.filter((c): c is number => c != null)
    const prevClose = validCloses.at(-2) ?? result.meta?.chartPreviousClose ?? null

    const change    = prevClose != null ? price - prevClose : 0
    const changePct = prevClose != null && prevClose !== 0 ? (change / prevClose) * 100 : 0

    const data: QuoteData = { price, change, changePct }
    quoteCache.set(ticker, { data, exp: Date.now() + CACHE_TTL })
    return data
  } catch {
    return null
  }
}

// GET /api/quotes?tickers=AAPL,005930
export async function GET(req: NextRequest) {
  const raw     = req.nextUrl.searchParams.get('tickers') ?? ''
  const tickers = raw.split(',').map(t => t.trim().toUpperCase()).filter(Boolean)
  if (!tickers.length) return NextResponse.json({})

  const entries = await Promise.all(
    tickers.map(async t => [t, await fetchQuote(t)] as const)
  )
  return NextResponse.json(Object.fromEntries(entries))
}
