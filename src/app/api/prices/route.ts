import { NextRequest, NextResponse } from 'next/server'
import { fetchUSPrice, fetchKRPrice, IS_KR } from '@/lib/livePrice'

// ─── GET /api/prices?tickers=AAPL,005930 ─────────────────────────
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('tickers') ?? ''
  const tickers = raw.split(',').map(t => t.trim().toUpperCase()).filter(Boolean)
  if (!tickers.length) return NextResponse.json({})

  const entries = await Promise.all(
    tickers.map(async t => [t, await (IS_KR(t) ? fetchKRPrice(t) : fetchUSPrice(t))] as const)
  )
  return NextResponse.json(Object.fromEntries(entries))
}
