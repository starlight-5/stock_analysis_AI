import { NextRequest, NextResponse } from 'next/server'
import { fetchStockData } from '@/lib/dataSource'
import { calcIndicators } from '@/lib/indicators'

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get('ticker')
  if (!ticker) return NextResponse.json({ error: 'ticker 파라미터 필요' }, { status: 400 })

  try {
    const result = await fetchStockData(ticker.toUpperCase())
    const indicators = calcIndicators(result.bars)

    return NextResponse.json({
      ticker: result.ticker,
      bars: result.bars,
      indicators,
      source: result.source,
      fetchedAt: result.fetchedAt,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
