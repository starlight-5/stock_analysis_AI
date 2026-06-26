import type { OHLCVBar, StockDataResult, DataSource } from '@/types/stock'
import { getKIToken, KI_BASE, KI_KEY, KI_SECRET } from '@/lib/kisToken'

const ALPACA_KEY_ID = process.env.ALPACA_API_KEY_ID ?? ''
const ALPACA_SECRET = process.env.ALPACA_SECRET_KEY ?? ''

// ─── 캐시 ────────────────────────────────────────────────────────
;(globalThis as any).__stockCache ??= new Map()
const cache: Map<string, { data: StockDataResult; expiresAt: number }> =
  (globalThis as any).__stockCache
const CACHE_TTL_MS = 0  // 현재가는 캐시하지 않음

function getCached(key: string): StockDataResult | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) { cache.delete(key); return null }
  return entry.data
}
function setCache(key: string, data: StockDataResult) {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS })
}

// ─── 1. Alpaca (US 주식) ─────────────────────────────────────────
async function fetchFromAlpaca(ticker: string): Promise<OHLCVBar[]> {
  if (!ALPACA_KEY_ID || !ALPACA_SECRET)
    throw new Error('ALPACA_API_KEY_ID 또는 ALPACA_SECRET_KEY 미설정')

  const start = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10)
  const url = `https://data.alpaca.markets/v2/stocks/${ticker}/bars` +
    `?timeframe=1Day&start=${start}&limit=120&feed=iex&sort=asc`

  const res = await fetch(url, {
    headers: {
      'APCA-API-KEY-ID':     ALPACA_KEY_ID,
      'APCA-API-SECRET-KEY': ALPACA_SECRET,
      'Accept': 'application/json',
    },
  })
  if (!res.ok) throw new Error(`Alpaca HTTP ${res.status}`)

  const json = await res.json()
  if (!json.bars?.length) throw new Error(`Alpaca: ${ticker} 데이터 없음`)

  return json.bars
    .map((b: any) => ({
      date: b.t.slice(0, 10),
      open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v,
    }))
    .sort((a: any, b: any) => a.date.localeCompare(b.date))
}

// ─── 2. 한국투자증권 (국내 6자리 종목코드 — 숫자·알파뉴메릭 모두) ─
// tr_id: FHKST03010100 (실전·모의 동일)
// 1회 최대 100건 → 120일 확보를 위해 2회 호출 (페이지네이션)
async function fetchFromKoreaInvestment(ticker: string): Promise<OHLCVBar[]> {

  const token = await getKIToken()

  // 날짜 헬퍼
  const toYMD = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '')
  const today  = toYMD(new Date())
  const past120 = toYMD(new Date(Date.now() - 120 * 86400000))
  const past60  = toYMD(new Date(Date.now() - 60  * 86400000))

  // 공통 fetch — tr_cont: '' (첫 페이지), 'N' (다음 없음 시 자동 종료)
  async function fetchPage(dateFrom: string, dateTo: string): Promise<OHLCVBar[]> {
    const params = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: 'J',
      FID_INPUT_ISCD:          ticker,
      FID_INPUT_DATE_1:        dateFrom,
      FID_INPUT_DATE_2:        dateTo,
      FID_PERIOD_DIV_CODE:     'D',
      FID_ORG_ADJ_PRC:         '0', // 수정주가
    })

    const res = await fetch(
      `${KI_BASE}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?${params}`,
      {
        headers: {
          authorization: `Bearer ${token}`,
          appkey:    KI_KEY,
          appsecret: KI_SECRET,
          tr_id:     'FHKST03010100', // 일봉 차트 (수정: FHKST01010100 → FHKST03010100)
          custtype:  'P',
          tr_cont:   '',
        },
        signal: AbortSignal.timeout(10000),
      }
    )
    if (!res.ok) {
      let detail = ''
      try { detail = ` — ${JSON.stringify(await res.json())}` } catch {}
      throw new Error(`한투 HTTP ${res.status}${detail}`)
    }

    const json = await res.json()
    if (json.rt_cd !== '0') throw new Error(`한투 API 오류: ${json.msg1}`)

    const output2: any[] = json.output2 ?? []
    return output2.map((row) => ({
      date:   `${row.stck_bsop_date.slice(0,4)}-${row.stck_bsop_date.slice(4,6)}-${row.stck_bsop_date.slice(6,8)}`,
      open:   parseFloat(row.stck_oprc),
      high:   parseFloat(row.stck_hgpr),
      low:    parseFloat(row.stck_lwpr),
      close:  parseFloat(row.stck_clpr),
      volume: parseInt(row.acml_vol, 10),
    }))
  }

  // 최신 60일 + 그 이전 60일 병렬 조회 → 최대 120개
  const [newer, older] = await Promise.all([
    fetchPage(past60,  today),
    fetchPage(past120, past60),
  ])

  // 합산 후 날짜순 정렬, 중복 제거 (경계일 중복 가능)
  const merged = [...older, ...newer]
  const seen   = new Set<string>()
  const bars   = merged
    .filter(b => { if (seen.has(b.date)) return false; seen.add(b.date); return true })
    .sort((a, b) => a.date.localeCompare(b.date))

  if (bars.length === 0) throw new Error('한투: 해당 기간 데이터 없음 (장외 시간이거나 상장 전 종목일 수 있음)')

  return bars
}

// ─── 종목명 조회 (Yahoo Finance) ─────────────────────────────────
async function fetchStockName(ticker: string): Promise<string | undefined> {
  try {
    const isKr = ticker.length === 6 && /^\d/.test(ticker) && /^[A-Z0-9]+$/i.test(ticker)
    const symbol = isKr ? `${ticker}.KS` : ticker
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000) }
    )
    const json = await res.json()
    const meta = json.chart?.result?.[0]?.meta
    return meta?.shortName ?? meta?.longName ?? undefined
  } catch {
    return undefined
  }
}

// ─── 퍼블릭 진입점 ───────────────────────────────────────────────
export async function fetchStockData(ticker: string): Promise<StockDataResult> {
  const cacheKey = `stock:${ticker}`
  const cached = getCached(cacheKey)
  if (cached) return cached

  // 6자리이고 숫자로 시작하면 한국 시장 종목으로 판단 (순수 숫자 + 알파뉴메릭 모두)
  const isKorean = ticker.length === 6 && /^\d/.test(ticker) && /^[A-Z0-9]+$/i.test(ticker)
  let bars: OHLCVBar[]
  let source: DataSource

  if (isKorean) {
    bars   = await fetchFromKoreaInvestment(ticker)
    source = 'korea_investment'
  } else {
    bars   = await fetchFromAlpaca(ticker)
    source = 'alpaca'
  }

  const name   = await fetchStockName(ticker)
  const result: StockDataResult = { ticker, name, bars, source, fetchedAt: new Date().toISOString() }
  setCache(cacheKey, result)
  return result
}

export { fetchFromAlpaca, fetchFromKoreaInvestment }
