/**
 * 주식 데이터 통합 데이터소스 모듈
 *
 * 미국 주식: Yahoo Finance Chart API (1d bars) 호출 — query1 실패 시 query2 폴백
 * 한국 주식: 한국투자증권 UAPI (국내주식기간별일봉) 호출
 *
 * globalThis를 사용해 메모리에 데이터를 캐싱하여 불필요한 API 호출을 줄인다.
 * (현재는 CACHE_TTL_MS가 0이므로 실제 캐싱은 하지 않고 항상 실시간 조회하도록 설정됨)
 */
import type { OHLCVBar, StockDataResult, DataSource } from '@/types/stock'
import { getKIToken, KI_BASE, KI_KEY, KI_SECRET } from '@/lib/kisToken'

// ─── 캐시 ────────────────────────────────────────────────────────
// globalThis를 통해 서버리스 인스턴스 환경 내에서 단일 캐시 맵을 유지한다.
;(globalThis as any).__stockCache ??= new Map()
const cache: Map<string, { data: StockDataResult; expiresAt: number }> =
  (globalThis as any).__stockCache
const CACHE_TTL_MS = 0  // 현재가는 캐시하지 않음

/** 캐시에서 유효한 데이터를 가져옴 (만료된 경우 삭제 후 null 반환) */
function getCached(key: string): StockDataResult | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) { cache.delete(key); return null }
  return entry.data
}
/** 데이터를 메모리 캐시에 적재 */
function setCache(key: string, data: StockDataResult) {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS })
}

// ─── 1. Yahoo Finance (US 주식) ──────────────────────────────────
async function fetchFromYahooFinance(ticker: string, days = 180): Promise<OHLCVBar[]> {
  const range = days <= 30 ? '1mo' : days <= 90 ? '3mo' : days <= 180 ? '6mo' : '1y'

  const tryFetch = async (host: string): Promise<OHLCVBar[]> => {
    const url = `https://${host}/v8/finance/chart/${ticker}?interval=1d&range=${range}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`Yahoo Finance HTTP ${res.status}`)

    const json = await res.json()
    const result = json.chart?.result?.[0]
    if (!result) throw new Error('Yahoo Finance: result 없음')

    const timestamps: number[] = result.timestamp ?? []
    const quote = result.indicators?.quote?.[0]
    if (!timestamps.length || !quote) throw new Error('Yahoo Finance: OHLCV 데이터 없음')

    const bars: OHLCVBar[] = []
    for (let i = 0; i < timestamps.length; i++) {
      const open  = quote.open?.[i]
      const high  = quote.high?.[i]
      const low   = quote.low?.[i]
      const close = quote.close?.[i]
      const volume = quote.volume?.[i]
      // null 캔들(거래 없는 날) 스킵
      if (open == null || high == null || low == null || close == null) continue
      const date = new Date(timestamps[i] * 1000).toISOString().slice(0, 10)
      bars.push({ date, open, high, low, close, volume: volume ?? 0 })
    }

    if (!bars.length) throw new Error(`Yahoo Finance: ${ticker} 유효 데이터 없음`)
    return bars.sort((a, b) => a.date.localeCompare(b.date))
  }

  // query1 실패 시 query2로 폴백
  try {
    return await tryFetch('query1.finance.yahoo.com')
  } catch (e1) {
    try {
      return await tryFetch('query2.finance.yahoo.com')
    } catch (e2) {
      throw new Error(`Yahoo Finance 조회 실패 (query1: ${e1}, query2: ${e2})`)
    }
  }
}

// ─── 2. 한국투자증권 (국내 6자리 종목코드 — 숫자·알파뉴메릭 모두) ─
// tr_id: FHKST03010100 (실전·모의 동일)
// 1회 최대 100건 → 120일 확보를 위해 2회 호출 (페이지네이션)
async function fetchFromKoreaInvestment(ticker: string): Promise<OHLCVBar[]> {

  const token = await getKIToken()

  // 날짜 헬퍼
  const toYMD = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '')
  const today  = toYMD(new Date())
  const past180 = toYMD(new Date(Date.now() - 180 * 86400000))
  const past60  = toYMD(new Date(Date.now() -  60 * 86400000))

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
    fetchPage(past180, past60),
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
  const isKr = ticker.length === 6 && /^\d/.test(ticker) && /^[A-Z0-9]+$/i.test(ticker)
  if (!isKr) {
    try {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`,
        { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000) }
      )
      const json = await res.json()
      const meta = json.chart?.result?.[0]?.meta
      return meta?.shortName ?? meta?.longName ?? undefined
    } catch {
      return undefined
    }
  }

  // 국내 종목: KS(코스피) 먼저 시도, 실패 시 KQ(코스닥) 재시도
  for (const suffix of ['.KS', '.KQ']) {
    try {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}${suffix}?interval=1d&range=1d`,
        { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000) }
      )
      const json = await res.json()
      const meta = json.chart?.result?.[0]?.meta
      const name = meta?.shortName ?? meta?.longName
      if (name) return name
    } catch {
      // 다음 suffix 시도
    }
  }
  return undefined
}

// ─── 퍼블릭 진입점 ───────────────────────────────────────────────
export async function fetchStockData(ticker: string, days = 180): Promise<StockDataResult> {
  const cacheKey = `stock:${ticker}:${days}`
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
    bars   = await fetchFromYahooFinance(ticker, days)
    source = 'yahoo'
  }

  const name   = await fetchStockName(ticker)
  const result: StockDataResult = { ticker, name, bars, source, fetchedAt: new Date().toISOString() }
  setCache(cacheKey, result)
  return result
}

export { fetchFromYahooFinance, fetchFromKoreaInvestment }
