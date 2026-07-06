/**
 * 실시간 현재가 조회 (US: Yahoo Finance, KR: 한국투자증권)
 * /api/prices 와 전략 분석(strategyAnalyzer) 양쪽에서 공유합니다.
 */
import { getKIToken, KI_BASE, KI_KEY, KI_SECRET } from '@/lib/kisToken'
import type { ExtInfo, PriceData } from '@/types/price'

const CACHE_TTL = 0  // 현재가는 캐시하지 않음
export const IS_KR = (t: string) => /^\d{6}$/.test(t)

;(globalThis as any).__priceCache2 ??= new Map()
const priceCache: Map<string, { data: PriceData; exp: number }> = (globalThis as any).__priceCache2

// ─── US: Yahoo Finance (정규장 + 시간외) ──────────────────────────
export async function fetchUSPrice(ticker: string): Promise<PriceData> {
  const hit = priceCache.get(ticker)
  if (hit && Date.now() < hit.exp) return hit.data

  try {
    // v7 quote API: marketState + pre/postMarketPrice 를 더 안정적으로 제공
    const res = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${ticker}&fields=regularMarketPrice,previousClose,preMarketPrice,postMarketPrice,marketState`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(8000),
      }
    )
    const json = await res.json()
    const q = json.quoteResponse?.result?.[0]

    if (!q) throw new Error('no quote')

    const price: number | null = q.regularMarketPrice ?? q.previousClose ?? null
    const marketState: string = q.marketState ?? 'CLOSED'

    let ext: ExtInfo | null = null

    if (marketState === 'PRE' && q.preMarketPrice) {
      const base = q.previousClose ?? q.regularMarketPrice ?? q.preMarketPrice
      const change = q.preMarketPrice - base
      ext = {
        price: q.preMarketPrice,
        change,
        changePct: base ? (change / base) * 100 : 0,
        type: 'pre',
      }
    } else if ((marketState === 'POST' || marketState === 'POSTPOST') && q.postMarketPrice) {
      const base = q.regularMarketPrice ?? q.postMarketPrice
      const change = q.postMarketPrice - base
      ext = {
        price: q.postMarketPrice,
        change,
        changePct: base ? (change / base) * 100 : 0,
        type: 'post',
      }
    }

    const data: PriceData = { price, ext }
    priceCache.set(ticker, { data, exp: Date.now() + CACHE_TTL })
    return data
  } catch {
    // 폴백: chart API
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
      const data: PriceData = { price, ext: null }
      priceCache.set(ticker, { data, exp: Date.now() + CACHE_TTL })
      return data
    } catch {
      return { price: null, ext: null }
    }
  }
}

// ─── KR: 정규장 여부 판단 (KST 기준 평일 09:00~15:30) ───────────
function isKRRegularSession(): boolean {
  const kstMs = Date.now() + 9 * 60 * 60 * 1000
  const kst = new Date(kstMs)
  const day = kst.getUTCDay()
  if (day === 0 || day === 6) return false
  const totalMin = kst.getUTCHours() * 60 + kst.getUTCMinutes()
  return totalMin >= 9 * 60 && totalMin < 15 * 60 + 30
}

// ─── KR: 평일 시간외 여부 (주말·공휴일 제외) ─────────────────────
function isKRExtSession(): boolean {
  const kstMs = Date.now() + 9 * 60 * 60 * 1000
  const kst = new Date(kstMs)
  const day = kst.getUTCDay()
  if (day === 0 || day === 6) return false
  const totalMin = kst.getUTCHours() * 60 + kst.getUTCMinutes()
  return totalMin < 9 * 60 || totalMin >= 15 * 60 + 30
}

// ─── KR: KIS 현재가 (정규장 + 시간외 통합) ───────────────────────
export async function fetchKRPrice(ticker: string): Promise<PriceData> {
  const hit = priceCache.get(ticker)
  if (hit && Date.now() < hit.exp) return hit.data

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
    if (!res.ok) return { price: null, ext: null }
    const json = await res.json()
    if (json.rt_cd !== '0') return { price: null, ext: null }

    const o = json.output
    const price = parseFloat(o?.stck_prpr ?? '0') || null
    if (!price) return { price: null, ext: null }

    let ext: ExtInfo | null = null
    if (isKRExtSession()) {
      const change = parseFloat(o?.prdy_vrss ?? '0')
      const changePct = parseFloat(o?.prdy_ctrt ?? '0')
      const kstMs = Date.now() + 9 * 60 * 60 * 1000
      const kst = new Date(kstMs)
      const totalMin = kst.getUTCHours() * 60 + kst.getUTCMinutes()
      const type: 'pre' | 'post' = totalMin < 9 * 60 ? 'pre' : 'post'
      ext = { price, change, changePct, type }
    }

    const data: PriceData = { price, ext }
    priceCache.set(ticker, { data, exp: Date.now() + CACHE_TTL })
    return data
  } catch {
    return { price: null, ext: null }
  }
}

// ─── 공통 진입점 (티커로 US/KR 자동 분기) ─────────────────────────
export async function fetchLivePrice(ticker: string): Promise<PriceData> {
  return IS_KR(ticker) ? fetchKRPrice(ticker) : fetchUSPrice(ticker)
}
