/**
 * GET /api/stock?ticker=AAPL
 * 지정한 종목의 최근 일봉 가격 데이터(bars)와 보조지표 계산 결과(indicators)를 함께 가져오는 엔드포인트.
 */
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
      ticker:    result.ticker,
      name:      result.name,
      bars:      result.bars,
      indicators,
      source:    result.source,
      fetchedAt: result.fetchedAt,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
