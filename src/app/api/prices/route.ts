import { NextRequest, NextResponse } from 'next/server'

const CACHE_TTL = 5 * 60 * 1000
;(globalThis as any).__priceCache ??= new Map()
const priceCache: Map<string, { price: number; exp: number }> = (globalThis as any).__priceCache

async function fetchPrice(ticker: string): Promise<number | null> {
  const cached = priceCache.get(ticker)
  if (cached && Date.now() < cached.exp) return cached.price

  // 국내 6자리는 .KS 접미사
  const symbol = /^\d{6}$/.test(ticker) ? `${ticker}.KS` : ticker
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(8000),
      }
    )
    const json = await res.json()
    const meta  = json.chart?.result?.[0]?.meta
    const price = meta?.regularMarketPrice ?? meta?.previousClose ?? null
    if (price != null) priceCache.set(ticker, { price, exp: Date.now() + CACHE_TTL })
    return price
  } catch {
    return null
  }
}

// GET /api/prices?tickers=AAPL,005930,TSLA
export async function GET(req: NextRequest) {
  const raw     = req.nextUrl.searchParams.get('tickers') ?? ''
  const tickers = raw.split(',').map(t => t.trim().toUpperCase()).filter(Boolean)
  if (!tickers.length) return NextResponse.json({})

  const entries = await Promise.all(
    tickers.map(async t => [t, await fetchPrice(t)] as const)
  )
  return NextResponse.json(Object.fromEntries(entries))
}
