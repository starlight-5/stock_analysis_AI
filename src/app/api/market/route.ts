import { NextResponse } from 'next/server'

const INDEX_SYMBOLS = ['^IXIC', '^GSPC', '^VIX']
const TTL_MS = 5 * 60 * 1000

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

// [FIX 2] 전일 환율을 history 엔드포인트로 조회해 등락 계산.
// open.er-api.com 무료 플랜에서 history가 지원되지 않으면 change=0으로 graceful fallback.
async function fetchKRW() {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  // 주말이면 금요일로 되감기 (토→금, 일→금)
  const dow = yesterday.getDay()
  if (dow === 0) yesterday.setDate(yesterday.getDate() - 2) // 일요일
  if (dow === 6) yesterday.setDate(yesterday.getDate() - 1) // 토요일
  const ymd = yesterday.toISOString().split('T')[0]

  const [curResult, hisResult] = await Promise.allSettled([
    fetch('https://open.er-api.com/v6/latest/USD',           { signal: AbortSignal.timeout(6000) }),
    fetch(`https://open.er-api.com/v6/history/USD/${ymd}`,   { signal: AbortSignal.timeout(6000) }),
  ])

  if (curResult.status !== 'fulfilled' || !curResult.value.ok) throw new Error('KRW 조회 실패')
  const curJson = await curResult.value.json()
  const price   = curJson.rates?.KRW as number
  if (!price) throw new Error('KRW 없음')

  // history 조회 성공 시 전일 대비 등락 계산
  let change = 0, changePct = 0
  if (hisResult.status === 'fulfilled' && hisResult.value.ok) {
    const hisJson   = await hisResult.value.json()
    const prevPrice = hisJson.rates?.KRW as number | undefined
    if (prevPrice) {
      change    = price - prevPrice
      changePct = (change / prevPrice) * 100
    }
  }

  return { price, change, changePct }
}

export async function GET() {
  if (cache.data && Date.now() < cache.exp) {
    return NextResponse.json(cache.data)
  }

  const results = await Promise.allSettled([
    ...INDEX_SYMBOLS.map(s => fetchIndex(s).then(v => [s, v] as const)),
    fetchKRW().then(v => ['USDKRW=X', v] as const),
  ])

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
