/**
 * GET /api/market
 * NASDAQ, S&P 500, VIX, USD/KRW 환율 지수를 Yahoo Finance API로 조회하여 반환하는 엔드포인트.
 * 잦은 외부 요청으로 인한 차단 및 속도 저하를 방지하기 위해 5분 인메모리 캐싱을 적용한다.
 */
import { NextResponse } from 'next/server'

const INDEX_SYMBOLS = ['^IXIC', '^GSPC', '^VIX', 'USDKRW=X']
const TTL_MS = 5 * 60 * 1000 // 5분 캐시 만료시간

// globalThis에 캐시 객체를 할당하여 개발 서버 HMR 환경 및 서버리스 인스턴스 웜 상태에서 데이터 재사용
;(globalThis as any).__marketCache ??= { data: null, exp: 0 }
const cache: { data: object | null; exp: number } = (globalThis as any).__marketCache

async function fetchIndex(symbol: string) {
  const enc = encodeURIComponent(symbol)
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${enc}?interval=1d&range=2d`,
    {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(6000),
    }
  )
  if (!res.ok) throw new Error(`${symbol} HTTP ${res.status}`)
  const json = await res.json()
  const meta = json.chart?.result?.[0]?.meta
  if (!meta) throw new Error(`${symbol} 응답 없음`)
  const price = meta.regularMarketPrice as number
  const prev  = meta.chartPreviousClose as number
  const change    = price - prev
  const changePct = (change / prev) * 100
  return { price, change, changePct }
}

export async function GET() {
  if (cache.data && Date.now() < cache.exp) {
    return NextResponse.json(cache.data)
  }

  const results = await Promise.allSettled(
    INDEX_SYMBOLS.map(s => fetchIndex(s).then(v => [s, v] as const))
  )

  const data: Record<string, { price: number; change: number; changePct: number }> = {}
  for (const r of results) {
    if (r.status === 'fulfilled') {
      const [sym, val] = r.value
      data[sym] = val
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: '모든 시장 데이터 조회 실패' }, { status: 502 })
  }

  cache.data = data
  cache.exp  = Date.now() + TTL_MS
  return NextResponse.json(data)
}
