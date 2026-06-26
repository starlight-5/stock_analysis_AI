import { NextRequest, NextResponse } from 'next/server'
import { getKIToken, KI_BASE, KI_KEY, KI_SECRET } from '@/lib/kisToken'

export type RankingItem = {
  symbol: string
  name: string
  price: number
  change: number
  changePct: number
  volume: number
  dollarVolume: number
  marketCap: number | null
  market: 'us' | 'kr'
}

const TTL_MS = 5 * 60 * 1000

;(globalThis as any).__rankCacheUS ??= { data: null, exp: 0 }
;(globalThis as any).__rankCacheKR ??= { data: null, exp: 0 }
const cacheUS: { data: RankingItem[] | null; exp: number } = (globalThis as any).__rankCacheUS
const cacheKR: { data: RankingItem[] | null; exp: number } = (globalThis as any).__rankCacheKR

// ─── US (Yahoo Finance) ──────────────────────────────────────────
async function fetchUS(): Promise<RankingItem[]> {
  if (cacheUS.data && Date.now() < cacheUS.exp) return cacheUS.data

  const res = await fetch(
    'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=most_actives&count=100&start=0',
    {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(10000),
    }
  )
  if (!res.ok) throw new Error(`Yahoo Finance HTTP ${res.status}`)
  const json = await res.json()
  const quotes: any[] = json.finance?.result?.[0]?.quotes ?? []
  if (!quotes.length) throw new Error('빈 응답')

  const data: RankingItem[] = quotes.map((q: any) => {
    const price  = q.regularMarketPrice  ?? 0
    const volume = q.regularMarketVolume ?? 0
    return {
      symbol:       q.symbol,
      name:         q.shortName ?? q.longName ?? q.symbol,
      price,
      change:       q.regularMarketChange         ?? 0,
      changePct:    q.regularMarketChangePercent   ?? 0,
      volume,
      dollarVolume: price * volume,
      marketCap:    q.marketCap ?? null,
      market: 'us',
    }
  })

  cacheUS.data = data
  cacheUS.exp  = Date.now() + TTL_MS
  return data
}

// ─── KR (한국투자증권 거래량 순위) ────────────────────────────────
// 토큰은 kisToken.ts 싱글턴에서 관리 (dataSource · rankings 공유, 중복 발급 방지)

async function fetchKR(): Promise<RankingItem[]> {
  if (cacheKR.data && Date.now() < cacheKR.exp) return cacheKR.data

  const token  = await getKIToken()
  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: 'J',
    FID_COND_SCR_DIV_CODE:  '20171',
    FID_INPUT_ISCD:         '0000',
    FID_DIV_CLS_CODE:       '0',
    FID_BLNG_CLS_CODE:      '0',
    FID_TRGT_CLS_CODE:      '111111111',
    FID_TRGT_EXLS_CLS_CODE: '000000',
    FID_INPUT_PRICE_1:      '',
    FID_INPUT_PRICE_2:      '',
    FID_VOL_CNT:            '',
    FID_INPUT_DATE_1:       '',
  })

  const res = await fetch(
    `${KI_BASE}/uapi/domestic-stock/v1/quotations/volume-rank?${params}`,
    {
      headers: {
        authorization: `Bearer ${token}`,
        appkey:    KI_KEY,
        appsecret: KI_SECRET,
        tr_id:     'FHPST01710000', // 거래량 순위 — 모의/실전 동일
        custtype:  'P',
      },
      signal: AbortSignal.timeout(10000),
    }
  )

  if (!res.ok) {
    let detail = ''
    try { detail = ` — ${JSON.stringify(await res.json())}` } catch {}
    throw new Error(`한투 거래량순위 HTTP ${res.status}${detail}`)
  }

  const json = await res.json()
  if (json.rt_cd !== '0') throw new Error(`한투 API 오류: ${json.msg1}`)

  const output: any[] = json.output ?? []
  if (output.length > 0) console.log('[rankings] mksc_shrn_iscd 샘플:', output.slice(0, 3).map((r: any) => r.mksc_shrn_iscd))

  const data: RankingItem[] = output.map((row: any) => {
    const price    = parseInt(row.stck_prpr     ?? '0', 10)
    const volume   = parseInt(row.acml_vol      ?? '0', 10)
    const trPbmn   = parseInt(row.acml_tr_pbmn  ?? '0', 10)
    const change   = parseInt(row.prdy_vrss     ?? '0', 10)
    const prevPrice = price - change
    const changePct = prevPrice !== 0 ? (change / prevPrice) * 100 : 0
    return {
      symbol:      row.mksc_shrn_iscd,
      name:        row.hts_kor_isnm,
      price, change, changePct, volume,
      dollarVolume: trPbmn,
      marketCap:   null,
      market: 'kr',
    }
  })

  cacheKR.data = data
  cacheKR.exp  = Date.now() + TTL_MS
  return data
}

// ─── Route Handler ───────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const market = req.nextUrl.searchParams.get('market') ?? 'us'

  try {
    const data = market === 'kr' ? await fetchKR() : await fetchUS()
    return NextResponse.json(data)
  } catch (e: any) {
    console.error('[rankings]', e.message)
    return NextResponse.json({ error: e.message })
  }
}
