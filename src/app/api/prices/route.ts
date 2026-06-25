import { NextRequest, NextResponse } from 'next/server'
import { getKIToken, KI_BASE, KI_KEY, KI_SECRET } from '@/lib/kisToken'

const CACHE_TTL = 5 * 60 * 1000
const IS_KR = (t: string) => /^\d{6}$/.test(t)

export type ExtInfo = { price: number; change: number; changePct: number; type: 'pre' | 'post' }
export type PriceData = { price: number | null; ext: ExtInfo | null }

;(globalThis as any).__priceCache2 ??= new Map()
const priceCache: Map<string, { data: PriceData; exp: number }> = (globalThis as any).__priceCache2

// ─── US: Yahoo Finance (정규장 + 시간외) ──────────────────────────
async function fetchUSPrice(ticker: string): Promise<PriceData> {
  const hit = priceCache.get(ticker)
  if (hit && Date.now() < hit.exp) return hit.data

  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(8000),
      }
    )
    const json = await res.json()
    const meta = json.chart?.result?.[0]?.meta
    const price: number | null = meta?.regularMarketPrice ?? meta?.previousClose ?? null
    const marketState: string = meta?.marketState ?? 'CLOSED'

    let ext: ExtInfo | null = null

    if (marketState === 'PRE' && meta?.preMarketPrice) {
      const base = meta?.previousClose ?? meta?.regularMarketPrice ?? meta.preMarketPrice
      const change = meta.preMarketPrice - base
      ext = {
        price: meta.preMarketPrice,
        change,
        changePct: base ? (change / base) * 100 : 0,
        type: 'pre',
      }
    } else if ((marketState === 'POST' || marketState === 'POSTPOST') && meta?.postMarketPrice) {
      const base = meta?.regularMarketPrice ?? meta.postMarketPrice
      const change = meta.postMarketPrice - base
      ext = {
        price: meta.postMarketPrice,
        change,
        changePct: base ? (change / base) * 100 : 0,
        type: 'post',
      }
    }

    const data: PriceData = { price, ext }
    priceCache.set(ticker, { data, exp: Date.now() + CACHE_TTL })
    return data
  } catch {
    return { price: null, ext: null }
  }
}

// ─── KR: KIS 시간외현재가 ─────────────────────────────────────────
async function fetchKISExtPrice(ticker: string): Promise<ExtInfo | null> {
  try {
    const token = await getKIToken()
    const params = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: 'J',
      FID_INPUT_ISCD: ticker,
    })
    const res = await fetch(
      `${KI_BASE}/uapi/domestic-stock/v1/quotations/inquire-price?${params}`,
      {
        headers: {
          authorization: `Bearer ${token}`,
          appkey: KI_KEY,
          appsecret: KI_SECRET,
          tr_id: 'FHPST01010000',
          custtype: 'P',
        },
        signal: AbortSignal.timeout(5000),
      }
    )
    if (!res.ok) return null
    const json = await res.json()
    if (json.rt_cd !== '0') return null

    const o = json.output
    const price = parseFloat(o?.stck_prpr ?? '0')
    if (!price || price <= 0) return null

    const change = parseFloat(o?.prdy_vrss ?? '0')
    const changePct = parseFloat(o?.prdy_ctrt ?? '0')

    // KST = UTC+9 기준으로 장전/장후 구분
    const kstHour = (new Date().getUTCHours() + 9) % 24
    const type: 'pre' | 'post' = kstHour < 9 ? 'pre' : 'post'

    return { price, change, changePct, type }
  } catch {
    return null
  }
}

// ─── KR: Yahoo Finance (정규가) + KIS (시간외) ────────────────────
async function fetchKRPrice(ticker: string): Promise<PriceData> {
  const hit = priceCache.get(ticker)
  if (hit && Date.now() < hit.exp) return hit.data

  const symbol = `${ticker}.KS`
  let price: number | null = null

  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(8000),
      }
    )
    const json = await res.json()
    const meta = json.chart?.result?.[0]?.meta
    price = meta?.regularMarketPrice ?? meta?.previousClose ?? null
  } catch {}

  // 정규가와 시간외 병렬 처리
  const ext = await fetchKISExtPrice(ticker)

  const data: PriceData = { price, ext }
  if (price != null) priceCache.set(ticker, { data, exp: Date.now() + CACHE_TTL })
  return data
}

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
