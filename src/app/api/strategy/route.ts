/**
 * @file route.ts
 * @description Google Gemini 1.5 Flash API를 활용하여 주식의 보조 지표를 분석하고 투자 전략을 수립하는 API 라우트입니다.
 * 
 * [동작 원리]
 * 1. 클라이언트로부터 주식 티커(예: AAPL)를 전달받아 해당 주식의 최근 가격 데이터 및 보조지표(RSI, MACD, Bollinger Bands, MA 등) 스냅샷을 수집합니다.
 * 2. 수집된 보조지표 데이터를 바탕으로 Gemini API 프롬프트를 빌드합니다.
 * 3. ⚠️ 외부 모듈 의존성 오류(npm 환경 문제 등)를 원천 차단하기 위해 Google Generative AI SDK 대신, 
 *    기본 내장 Web Fetch API를 사용하여 Gemini REST API 통신을 수행합니다.
 * 4. API 키가 없거나, `AQ.`로 시작하는 잘못된 형식의 키이거나, 호출 제한(Quota Exceeded) 등 API 요청이 실패할 경우,
 *    에러로 앱이 죽지 않도록 자체적인 규칙 기반(Rule-based) 투자 분석 생성기 `generateRuleBasedStrategy` 폴백 시스템을 즉시 작동합니다.
 * 5. 최종 분석 결과는 Recharts 차트 연동 및 UI 표기를 위해 정해진 JSON 규격(StrategyResult)으로 완벽하게 파싱되어 응답됩니다.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { fetchStockData } from '@/lib/dataSource'
import { calcIndicators, getSnapshot } from '@/lib/indicators'
import { getStrategyHistory, upsertStrategyHistory, buildPreviousContext } from '@/lib/strategyHistory'
import type { StrategyResult, IndicatorSnapshot } from '@/types/stock'

// ─── 전략 캐시 (10분 TTL) ────────────────────────────────────────
;(globalThis as any).__strategyCache ??= new Map()
const strategyCache: Map<string, { data: object; expiresAt: number }> =
  (globalThis as any).__strategyCache
const STRATEGY_TTL_MS = 10 * 60 * 1000

function getCachedStrategy(ticker: string) {
  const entry = strategyCache.get(ticker)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) { strategyCache.delete(ticker); return null }
  return entry.data
}
function setCachedStrategy(ticker: string, data: object) {
  strategyCache.set(ticker, { data, expiresAt: Date.now() + STRATEGY_TTL_MS })
}

// ─── Yahoo Finance 뉴스 fetcher ──────────────────────────────────

interface NewsItem {
  title: string
  publisher: string
  date: string
}

interface EarningsItem {
  period: string
  quarter: string
  epsEstimate: number | null
  epsActual: number | null
  surprisePercent: number | null
}

interface EarningsData {
  nextEarningsDate: string | null
  epsEstimateNext: number | null
  history: EarningsItem[]
}

async function fetchEarnings(ticker: string): Promise<EarningsData> {
  try {
    const symbol = /^\d{6}$/.test(ticker) ? `${ticker}.KS` : ticker
    const res = await fetch(
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=calendarEvents%2CearningsHistory`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(6000),
      }
    )
    const json = await res.json()
    const result = json?.quoteSummary?.result?.[0]

    const calEvents = result?.calendarEvents?.earnings
    const nextEarningsDate = calEvents?.earningsDate?.[0]?.fmt ?? null
    const epsEstimateNext = calEvents?.earningsAverage?.raw ?? null

    const rawHistory = result?.earningsHistory?.history ?? []
    const history: EarningsItem[] = rawHistory.slice(-4).map((h: any) => ({
      period: h.period ?? '',
      quarter: h.quarter?.fmt ?? '',
      epsEstimate: h.epsEstimate?.raw ?? null,
      epsActual: h.epsActual?.raw ?? null,
      surprisePercent: h.surprisePercent?.raw != null ? Math.round(h.surprisePercent.raw * 1000) / 10 : null,
    }))

    return { nextEarningsDate, epsEstimateNext, history }
  } catch {
    return { nextEarningsDate: null, epsEstimateNext: null, history: [] }
  }
}

async function fetchYahooNews(ticker: string): Promise<NewsItem[]> {
  try {
    const symbol = /^\d{6}$/.test(ticker) ? `${ticker}.KS` : ticker
    const res = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${symbol}&newsCount=8&quotesCount=0&enableFuzzyQuery=false`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(6000),
      }
    )
    const json = await res.json()
    return (json.news ?? []).slice(0, 6).map((n: any) => ({
      title:     n.title ?? '',
      publisher: n.publisher ?? '',
      date:      n.providerPublishTime
        ? new Date(n.providerPublishTime * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : '',
    }))
  } catch {
    return []
  }
}

// ─── 프롬프트 빌더 ───────────────────────────────────────────────

function buildPrompt(ticker: string, snap: IndicatorSnapshot, news: NewsItem[], earnings: EarningsData, previousContext = ''): string {
  const isKR = /^\d{6}$/.test(ticker)
  const fmt = (v: number | null, dec = 2) => v == null ? 'N/A' : v.toFixed(dec)
  const pct = (v: number | null) => v == null ? 'N/A' : `${(v * 100).toFixed(1)}%`
  const fmtPrice = (v: number | null) => {
    if (v == null) return 'N/A'
    return isKR
      ? `${Math.round(v).toLocaleString('ko-KR')}원`
      : `$${v.toFixed(2)}`
  }

  const priceUnit = isKR ? '원 단위 정수' : 'USD 소수점 2자리 숫자'
  const currentPrice = snap.close

  const bbPos = snap.bbPosition == null
    ? 'N/A'
    : snap.bbPosition < 0.2 ? `하단 근처 (${pct(snap.bbPosition)})`
    : snap.bbPosition > 0.8 ? `상단 근처 (${pct(snap.bbPosition)})`
    : `중간 (${pct(snap.bbPosition)})`

  const crossLabels: Record<IndicatorSnapshot['maCrossState'], string> = {
    golden:  '골든크로스 (5일선 > 20일선)',
    dead:    '데드크로스 (5일선 < 20일선)',
    neutral: '중립',
  }

  const newsSection = news.length > 0
    ? news.map((n, i) => `${i + 1}. [${n.date}] ${n.title} (${n.publisher})`).join('\n')
    : '뉴스 없음 — 기술적 지표만으로 판단할 것'

  const earningsSection = (() => {
    const lines: string[] = []
    if (earnings.nextEarningsDate) {
      const est = earnings.epsEstimateNext != null ? ` (예상 EPS: ${earnings.epsEstimateNext})` : ''
      lines.push(`- 다음 실적 발표일: ${earnings.nextEarningsDate}${est}`)
    } else {
      lines.push('- 다음 실적 발표일: 미확인')
    }
    if (earnings.history.length > 0) {
      lines.push('- 최근 EPS 실적 이력:')
      earnings.history.forEach((e, i) => {
        const actual  = e.epsActual   != null ? e.epsActual.toFixed(2)   : 'N/A'
        const est2    = e.epsEstimate != null ? e.epsEstimate.toFixed(2) : 'N/A'
        const surp    = e.surprisePercent != null
          ? ` → 서프라이즈 ${e.surprisePercent > 0 ? '+' : ''}${e.surprisePercent.toFixed(1)}%`
          : ''
        lines.push(`  ${i + 1}. ${e.period} (${e.quarter}): 예상 ${est2} / 실제 ${actual}${surp}`)
      })
    } else {
      lines.push('- 실적 이력 없음')
    }
    return lines.join('\n')
  })()

  return `
당신은 주식 기술적 분석 + 뉴스 감성 분석 + 실적 분석 전문가입니다.
아래 기술적 지표, 최근 뉴스, 실적 발표 데이터를 종합 분석하여 매매 전략을 수립하세요.
뉴스의 긍정·부정 sentiment 및 실적 서프라이즈가 기술적 신호와 충돌하면 이를 반드시 반영하고 risks에 명시하세요.

## 종목 정보
- 티커: ${ticker}
- 현재가: ${fmtPrice(currentPrice)}
- 가격 단위: ${priceUnit} (JSON 내 모든 price 필드에 이 단위를 사용할 것)
${previousContext}

## 기술적 지표 (일봉 기준 최신값)
- RSI(14): ${fmt(snap.rsi, 1)}${snap.rsi == null ? '' : snap.rsi < 30 ? ' ⚠️ 과매도' : snap.rsi > 70 ? ' ⚠️ 과매수' : ''}
- MACD: ${fmt(snap.macd)} / 시그널: ${fmt(snap.signal)} / 히스토그램: ${fmt(snap.histogram)}
- 볼린저 밴드: 상단 ${fmtPrice(snap.bbUpper)} / 중심 ${fmtPrice(snap.bbMid)} / 하단 ${fmtPrice(snap.bbLower)}
- 밴드 내 위치: ${bbPos}
- 이동평균: MA5 ${fmtPrice(snap.ma5)} / MA20 ${fmtPrice(snap.ma20)} / MA60 ${fmtPrice(snap.ma60)} / MA120 ${fmtPrice(snap.ma120)}
- 이동평균 크로스: ${crossLabels[snap.maCrossState]}
- 거래량 비율 (최근5일/20일평균): ${fmt(snap.volumeRatio, 2)}배

## 최근 뉴스 (Yahoo Finance)
${newsSection}

## 실적 발표 데이터 (Yahoo Finance)
${earningsSection}

## 출력 형식 (반드시 순수 JSON만 — 마크다운 코드블록 없이)
{
  "signal": "strong_buy | buy | watch | sell | strong_sell 중 하나",
  "summary": "기술적 지표와 뉴스를 종합한 핵심 포인트를 2-3문장으로 요약. 뉴스가 있으면 반드시 언급",
  "buyStrategy": {
    "type": "lump 또는 split",
    "entries": [
      { "price": ${priceUnit}, "ratio": 비중(0-100), "reason": "기술적 근거 또는 뉴스 근거" }
    ],
    "stopLoss": ${priceUnit},
    "stopLossReason": "구체적 손절 근거"
  },
  "sellStrategy": {
    "targets": [
      { "price": ${priceUnit}, "ratio": 비중(0-100), "reason": "기술적 근거 (MA선·BB밴드·매물대 등 구체적 레벨 명시)" }
    ]
  },
  "risks": ["리스크 1 (가능하면 뉴스 근거 포함)", "리스크 2", "리스크 3"],
  "holding": {
    "minWeeks": 최소 관찰 기간(정수, 주 단위),
    "targetWeeks": 권장 보유 기간(정수, 주 단위),
    "maxWeeks": 최대 보유 기간(정수, 주 단위),
    "stopCondition": "MA20(${fmtPrice(snap.ma20)}) 종가 이탈 시 즉시 손절 — 단기 추세선 붕괴",
    "reviewCondition": "targetWeeks 경과 후 1차 목표 미달 시 전략 재수립 (시간 손절)"
  }
}

## 전략 작성 규칙
1. split 조건: RSI < 40 또는 하락 추세 또는 BB 하단 근처 또는 부정적 뉴스 존재 → 2~3회 분할 진입
2. lump 조건: 강한 모멘텀 (거래량 급증 + 골든크로스 + RSI 50~65) AND 긍정적/중립 뉴스
3. 목표가 근거 규칙 (가장 중요):
   - targets의 reason은 반드시 구체적인 기술적 레벨을 명시할 것
     예시 (O): "MA60(${fmtPrice(snap.ma60)}) 저항선 도달", "볼린저 밴드 상단(${fmtPrice(snap.bbUpper)}) 저항", "MA120(${fmtPrice(snap.ma120)}) 장기 저항선"
     예시 (X): "+5% 수익 실현 구간", "+12% 목표가", "단기 익절 구간" — 단순 수익률 표기는 근거가 아니므로 절대 금지
   - 1차 목표가는 가능하면 MA60(${fmtPrice(snap.ma60)}) 또는 BB 중심선(${fmtPrice(snap.bbMid)}) 근처로 설정
   - 2차 목표가는 MA120(${fmtPrice(snap.ma120)}) 또는 BB 상단(${fmtPrice(snap.bbUpper)}) 근처로 설정
4. 손절선: MA20(${fmtPrice(snap.ma5 != null && snap.ma20 != null ? snap.ma20 : null)}) 또는 BB 하단(${fmtPrice(snap.bbLower)}) 등 실제 지지선 기준으로 설정
5. split 시 entries 2개 이상, ratio 합계 정확히 100
6. 모든 price 값은 ${priceUnit}로 출력 (문자열 아닌 숫자)
7. risks 최소 3개, 뉴스에서 발견된 리스크 우선 반영
8. signal과 entries 가격 일관성 (반드시 준수):
   - strong_buy/buy: 1차 진입가 ≤ 현재가 ${fmtPrice(currentPrice)}
   - watch: 모든 진입가 < 현재가 × 0.97 (최소 -3% 이하에서만 진입 대기)
   - sell/strong_sell: 모든 진입가 < 현재가 × 0.90 (큰 폭 하락 후에만 재진입 고려)
9. watch/sell/strong_sell 시그널 시 buyStrategy 처리:
   - entries는 1개만 작성 (하락 후 재진입 참고용, type은 "split" 고정)
   - summary에 "현재 진입 비추천" 문구 반드시 포함
10. 목표가 일관성:
    - strong_buy/buy: 모든 targets price > 현재가 ${fmtPrice(currentPrice)}
    - sell/strong_sell: targets는 빈 배열([])로 작성 가능
11. 분할 매수 간격: split 시 각 entries 진입가 간격 최소 2% 이상 차이 (예: 1차 ${fmtPrice(currentPrice)} → 2차는 최소 ${fmtPrice(currentPrice != null ? currentPrice * 0.98 : null)} 이하)
12. 진입가 vs 손절선 일관성 (반드시 준수):
    - 모든 entries의 price는 반드시 stopLoss보다 높아야 함
    - 진입가 ≤ 손절선인 경우는 "매수 즉시 손절" 이므로 절대 금지
    - 손절선은 가장 낮은 진입가보다 최소 1% 이상 낮게 설정할 것
      예시 (O): 2차 진입가 ${fmtPrice(snap.ma20)} → 손절선 ${fmtPrice(snap.ma20 != null ? snap.ma20 * 0.98 : null)}
      예시 (X): 2차 진입가 ${fmtPrice(snap.ma20)} → 손절선 ${fmtPrice(snap.ma20)} (동일 금지)
13. 실적 발표 반영 규칙:
    - 다음 실적 발표일이 2주 이내면 risks에 "실적 발표 이벤트 리스크 — [날짜]" 반드시 포함
    - 최근 EPS 서프라이즈가 연속 2회 이상 +10% 초과 시 signal 상향 가중 가능
    - 최근 EPS 서프라이즈가 -10% 이하 발생 시 signal 하향 가중 및 risks에 포함
    - 실적 이력이 없으면 해당 규칙은 무시하고 기술적 지표만으로 판단
`
}

// ─── Gemini 응답 파서 ────────────────────────────────────────────
/**
 * Gemini 모델의 텍스트 응답을 파싱하여 견고한 StrategyResult 객체로 정제합니다.
 */
function parseStrategyResponse(
  raw: string,
  ticker: string
): StrategyResult {
  const isKR = /^\d{6}$/.test(ticker)

  // 숫자가 아닌 문자(원, $, 콤마 등)가 섞인 가격 값을 안전하게 숫자로 변환
  const sanitizePrice = (v: any): number => {
    if (typeof v === 'number' && isFinite(v)) {
      return isKR ? Math.round(v) : Math.round(v * 100) / 100
    }
    if (typeof v === 'string') {
      const n = parseFloat(v.replace(/[^0-9.]/g, ''))
      if (!isNaN(n)) return isKR ? Math.round(n) : Math.round(n * 100) / 100
    }
    return 0
  }

  const cleaned = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim()

  let parsed: any
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    console.error('Gemini 응답 JSON 파싱 실패, 원문:', raw.slice(0, 300))
    return {
      ticker,
      generatedAt: new Date().toISOString(),
      summary: 'API 분석 데이터 분석 결과를 안전하게 파싱하는 데 실패했습니다. 원문을 토글하여 상세 내용을 확인하세요.',
      signal: 'watch',
      buyStrategy: {
        type: 'split',
        entries: [],
        stopLoss: 0,
        stopLossReason: '파싱 실패로 산출 불가',
      },
      sellStrategy: { targets: [] },
      risks: ['응답 데이터 파싱 실패', '일시적인 API 응답 규격 오류'],
      holding: { minWeeks: 2, targetWeeks: 6, maxWeeks: 12, stopCondition: 'MA20 이탈 시 손절', reviewCondition: '6주 경과 후 재검토' },
      rawText: raw,
    }
  }

  return {
    ticker,
    generatedAt: new Date().toISOString(),
    summary: parsed.summary ?? '주식 기술 지표 요약 제공 불가.',
    signal: parsed.signal ?? 'watch',
    buyStrategy: (() => {
      const stopLoss = sanitizePrice(parsed.buyStrategy?.stopLoss)
      const entries = (parsed.buyStrategy?.entries ?? [])
        .map((e: any) => ({ ...e, price: sanitizePrice(e.price) }))
        .filter((e: any) => e.price > stopLoss)  // 진입가 ≤ 손절선인 항목 제거
        .sort((a: any, b: any) => b.price - a.price)
      return {
        type: parsed.buyStrategy?.type ?? 'split',
        entries,
        stopLoss,
        stopLossReason: parsed.buyStrategy?.stopLossReason ?? '리스크 한도 초과 시 손절',
      }
    })(),
    sellStrategy: {
      targets: (parsed.sellStrategy?.targets ?? [])
        .map((t: any) => ({ ...t, price: sanitizePrice(t.price) }))
        .sort((a: any, b: any) => a.price - b.price),
    },
    risks: parsed.risks ?? ['시장 변동성 리스크', '종목 개별 재무 위험', '추세 반전 우려'],
    holding: {
      minWeeks:        parsed.holding?.minWeeks        ?? 2,
      targetWeeks:     parsed.holding?.targetWeeks     ?? 6,
      maxWeeks:        parsed.holding?.maxWeeks        ?? 12,
      stopCondition:   parsed.holding?.stopCondition   ?? 'MA20 종가 이탈 시 즉시 손절',
      reviewCondition: parsed.holding?.reviewCondition ?? '목표 기간 경과 후 1차 목표 미달 시 전략 재수립',
    },
    rawText: raw,
  }
}

// ─── 규칙 기반(Rule-based) 백업 전략 생성기 (폴백) ────────────────────
// 5개 지표(RSI·BB·MACD·MA크로스·거래량)를 점수화해 종합 판단.
// RSI+BB 두 개만 보던 방식에서 개선.
function generateRuleBasedStrategy(ticker: string, snap: IndicatorSnapshot): StrategyResult {
  const isKR  = /^\d{6}$/.test(ticker)
  const price  = snap.close
  const rsi    = snap.rsi ?? 50
  const bbPos  = snap.bbPosition ?? 0.5

  // ── 지표별 점수 (총합 -7 ~ +7) ────────────────────────────────
  // RSI: 극단값일수록 ±2, 중간 경계면 ±1
  const rsiScore =
    rsi < 30 ? 2 : rsi < 40 ? 1 : rsi > 70 ? -2 : rsi > 60 ? -1 : 0

  // 볼린저 밴드 위치
  const bbScore =
    bbPos < 0.15 ? 2 : bbPos < 0.35 ? 1 : bbPos > 0.85 ? -2 : bbPos > 0.65 ? -1 : 0

  // MACD: macd > signal 이고 히스토그램 확장 중이면 +1
  const macdScore = (() => {
    if (snap.macd == null || snap.signal == null) return 0
    if (snap.macd > snap.signal && (snap.histogram ?? 0) > 0) return 1
    if (snap.macd < snap.signal && (snap.histogram ?? 0) < 0) return -1
    return 0
  })()

  // MA 크로스
  const crossScore =
    snap.maCrossState === 'golden' ? 1 :
    snap.maCrossState === 'dead'   ? -1 : 0

  // 거래량: 방향을 증폭만 함 (방향이 없으면 0)
  const baseScore  = rsiScore + bbScore + macdScore + crossScore
  const volScore   = (() => {
    if ((snap.volumeRatio ?? 0) < 1.5) return 0
    return baseScore > 0 ? 1 : baseScore < 0 ? -1 : 0
  })()

  const totalScore = baseScore + volScore

  // ── 시그널 결정 ──────────────────────────────────────────────
  const signal: StrategyResult['signal'] =
    totalScore >= 5  ? 'strong_buy'  :
    totalScore >= 3  ? 'buy'         :
    totalScore <= -5 ? 'strong_sell' :
    totalScore <= -3 ? 'sell'        : 'watch'

  // ── 가격 유틸 ────────────────────────────────────────────────
  const r = (v: number) => isKR ? Math.round(v) : Math.round(v * 100) / 100

  // 지지선: MA20 우선 → BB 하단 → 현재가 -5%
  const support =
    snap.ma20 != null && snap.ma20 < price ? snap.ma20 :
    snap.bbLower != null ? snap.bbLower : price * 0.95

  // 저항선: MA60 우선 → BB 상단 → 현재가 +8%
  const resist =
    snap.ma60 != null && snap.ma60 > price ? snap.ma60 :
    snap.bbUpper != null ? snap.bbUpper : price * 1.08

  const ma20Str = snap.ma20 != null
    ? (isKR ? `${Math.round(snap.ma20).toLocaleString('ko-KR')}원` : `$${snap.ma20.toFixed(2)}`)
    : '근처'
  const ma60Str = snap.ma60 != null
    ? (isKR ? `${Math.round(snap.ma60).toLocaleString('ko-KR')}원` : `$${snap.ma60.toFixed(2)}`)
    : '근처'

  // ── 시그널 기여 문구 (summary·risks용) ──────────────────────
  const bullCues: string[] = []
  const bearCues: string[] = []
  if (rsiScore  >  0) bullCues.push(`RSI ${rsi.toFixed(1)} 과매도`)
  if (rsiScore  <  0) bearCues.push(`RSI ${rsi.toFixed(1)} 과매수`)
  if (bbScore   >  0) bullCues.push('BB 하단 근접')
  if (bbScore   <  0) bearCues.push('BB 상단 근접')
  if (macdScore >  0) bullCues.push('MACD 강세 전환')
  if (macdScore <  0) bearCues.push('MACD 약세 전환')
  if (crossScore > 0) bullCues.push('골든크로스')
  if (crossScore < 0) bearCues.push('데드크로스')
  if (volScore  >  0) bullCues.push('거래량 급증 확인')
  if (volScore  <  0) bearCues.push('거래량 급증 매도 확인')

  // ── 전략별 세부 결정 ─────────────────────────────────────────
  let summary: string
  let entries: StrategyResult['buyStrategy']['entries']
  let stopLoss: number
  let stopLossReason: string
  let targets: StrategyResult['sellStrategy']['targets']
  let risks: string[]

  if (signal === 'strong_buy') {
    summary = `${ticker}: ${bullCues.join(' · ')} 동시 발생 — 복수 지표 강한 매수 신호. (종합 점수 ${totalScore}/7)`
    entries = [
      { price: r(price * 0.99),                         ratio: 40, reason: `1차 — ${bullCues[0] ?? 'BB 하단 근접'}` },
      { price: r(Math.min(price * 0.96, support * 1.01)), ratio: 60, reason: `2차 — MA20(${ma20Str}) 지지 확인 비중 확대` },
    ]
    stopLoss       = r(support * 0.97)
    stopLossReason = `MA20(${ma20Str}) 하향 이탈 시 추세 전환으로 판단 손절`
    targets = [
      { price: r(price * 1.07),                          ratio: 50, reason: 'BB 중심선 도달 1차 익절' },
      { price: r(Math.max(resist, price * 1.14)),         ratio: 50, reason: `MA60(${ma60Str}) 저항 돌파 시 전량 익절` },
    ]
    risks = [
      bearCues.length > 0 ? `반대 지표 혼재: ${bearCues.join(', ')}` : '기술적 반등 실패 가능성',
      (snap.volumeRatio ?? 1) < 0.8 ? '거래량 부족 — 매수세 유입 불확실' : '외부 충격에 따른 지지선 붕괴 리스크',
      '과매도 구간 진입 후 추가 하락 지속 가능성 (칼날 받기)',
    ]

  } else if (signal === 'buy') {
    summary = `${ticker}: ${bullCues.join(' · ')} 확인 — 단기 조정 후 지지 구간 분할 매수 유효. (종합 점수 ${totalScore}/7)`
    entries = [
      { price: r(price * 0.99),                           ratio: 50, reason: `1차 — ${bullCues[0] ?? '현재가 근처'}` },
      { price: r(Math.min(price * 0.96, support * 1.005)), ratio: 50, reason: `2차 — MA20(${ma20Str}) 지지 후 추가` },
    ]
    stopLoss       = r(support * 0.96)
    stopLossReason = `MA20(${ma20Str}) 붕괴 시 손절`
    targets = [
      { price: r(price * 1.06),                   ratio: 60, reason: '단기 저항 1차 익절' },
      { price: r(Math.max(resist, price * 1.12)),  ratio: 40, reason: `MA60(${ma60Str}) 중기 저항 2차 익절` },
    ]
    risks = [
      crossScore < 0 ? '데드크로스 진행 중 — 중기 하락 우려' : '단기 반등 후 재하락 가능성',
      (snap.volumeRatio ?? 1) < 1.0 ? '거래량 감소 — 상승 지속 불확실' : '매물대 저항에 따른 상승 제한',
      '섹터 전반 기관·외인 매도세 리스크',
    ]

  } else if (signal === 'strong_sell') {
    summary = `${ticker}: ${bearCues.join(' · ')} 동시 발생 — 현재 진입 비추천. 큰 폭 하락 후 재진입 대기 권고. (종합 점수 ${totalScore}/7)`
    entries = [
      { price: r(price * 0.88), ratio: 100, reason: `급락 후 MA60(${ma60Str}) 근처에서만 보수적 재진입 검토` },
    ]
    stopLoss       = r(price * 0.82)
    stopLossReason = '추세 완전 이탈 시 즉시 손절'
    targets        = []
    risks = [
      `${bearCues.join(' · ')} — 복수 지표 동시 약세`,
      (snap.volumeRatio ?? 0) > 1.5 ? '높은 거래량 동반 하락 — 투매 징후' : '고점 매수자 차익 매물 출회 우려',
      '단기 과열 해소 이후에도 중기 하락 추세 전환 가능성',
    ]

  } else if (signal === 'sell') {
    summary = `${ticker}: ${bearCues.join(' · ')} — 현재 진입 비추천. 조정 대기 후 매수 검토. (종합 점수 ${totalScore}/7)`
    entries = [
      { price: r(price * 0.93), ratio: 100, reason: `조정 후 MA20(${ma20Str}) 지지 확인 시 재진입` },
    ]
    stopLoss       = r(price * 0.87)
    stopLossReason = `MA20(${ma20Str}) 붕괴 시 추가 하락 대비 손절`
    targets = [
      { price: r(price * 1.04), ratio: 50, reason: '보유 포지션 1차 비중 축소' },
      { price: r(price * 1.08), ratio: 50, reason: '오버슈팅 시 잔여 전량 익절' },
    ]
    risks = [
      crossScore < 0 ? '데드크로스 형성 — 하락 추세 가속 가능' : '상승 모멘텀 둔화 징후',
      `RSI ${rsi.toFixed(1)} — 고평가 구간 진입`,
      '수급 약화 시 빠른 조정 가능성',
    ]

  } else {
    // watch
    const mixed = bullCues.length > 0 && bearCues.length > 0
    summary = mixed
      ? `${ticker}: ${bullCues.join(' · ')} vs ${bearCues.join(' · ')} 혼재 — 방향성 확인 후 진입 권고. (종합 점수 ${totalScore}/7)`
      : `${ticker}: RSI ${rsi.toFixed(1)}, BB 중간 구간. 특별한 방향성 신호 없음 — 추세 돌파 확인 후 진입 권고.`
    entries = [
      { price: r(Math.min(price * 0.97, support * 1.01)),  ratio: 50, reason: `MA20(${ma20Str}) 지지 확인 시 1차 진입` },
      { price: r(Math.min(price * 0.94, support * 0.98)),  ratio: 50, reason: '하방 2차 분할 진입' },
    ]
    stopLoss       = r(support * 0.95)
    stopLossReason = `박스권 하향 이탈 및 MA20(${ma20Str}) 붕괴 시 손절`
    targets = [
      { price: r(Math.max(price * 1.04, resist * 0.97)), ratio: 50, reason: '박스권 상단 1차 익절' },
      { price: r(Math.max(price * 1.09, resist)),        ratio: 50, reason: `MA60(${ma60Str}) 저항선 돌파 시 2차 익절` },
    ]
    risks = [
      '방향성 미결 — 상하단 모두 진입 가능성',
      (snap.volumeRatio ?? 1) < 0.8 ? '거래량 부족 — 돌파 신뢰도 낮음' : '거래량 평이 — 강한 모멘텀 부재',
      macdScore === 0 ? 'MACD 신호 불명확 — 추가 관망 필요' : '지표 혼조로 전략 판단 어려움',
    ]
  }

  const holdingMap: Record<StrategyResult['signal'], { minWeeks: number; targetWeeks: number; maxWeeks: number }> = {
    strong_buy:  { minWeeks: 2, targetWeeks: 8,  maxWeeks: 16 },
    buy:         { minWeeks: 2, targetWeeks: 6,  maxWeeks: 12 },
    watch:       { minWeeks: 1, targetWeeks: 4,  maxWeeks: 8  },
    sell:        { minWeeks: 1, targetWeeks: 2,  maxWeeks: 4  },
    strong_sell: { minWeeks: 1, targetWeeks: 2,  maxWeeks: 4  },
  }
  const h = holdingMap[signal]

  return {
    ticker,
    generatedAt: new Date().toISOString(),
    summary,
    signal,
    buyStrategy: { type: 'split', entries, stopLoss, stopLossReason },
    sellStrategy: { targets },
    risks,
    holding: {
      ...h,
      stopCondition:   `MA20(${ma20Str}) 종가 이탈 시 즉시 손절 — 단기 추세선 붕괴`,
      reviewCondition: `${h.targetWeeks}주 경과 후 1차 목표 미달 시 전략 재수립 (시간 손절)`,
    },
    rawText: `[폴백 모드 — 규칙 기반 엔진]
점수: RSI ${rsiScore} + BB ${bbScore} + MACD ${macdScore} + MA크로스 ${crossScore} + 거래량 ${volScore} = 종합 ${totalScore}/7
판정: ${signal.toUpperCase()}`,
  }
}

// ─── DB 포지션 → StrategyResult 변환 (런타임 검증 포함) ────────────
const VALID_SIGNALS = new Set(['strong_buy', 'buy', 'watch', 'sell', 'strong_sell'])

function parsePositionToStrategy(position: {
  ticker: string
  registeredAt: Date
  summary: string
  signal: string
  entryType: string
  entries: unknown
  stopLoss: number
  stopLossReason: string
  targets: unknown
  risks: unknown
  holding: unknown
}): StrategyResult {
  const toEntries = (raw: unknown): StrategyResult['buyStrategy']['entries'] => {
    if (!Array.isArray(raw)) return []
    return raw.map((e: any) => ({
      price:  typeof e?.price  === 'number' ? e.price  : 0,
      ratio:  typeof e?.ratio  === 'number' ? e.ratio  : 0,
      reason: typeof e?.reason === 'string' ? e.reason : '',
    }))
  }

  const toTargets = (raw: unknown): StrategyResult['sellStrategy']['targets'] => {
    if (!Array.isArray(raw)) return []
    return raw.map((t: any) => ({
      price:  typeof t?.price  === 'number' ? t.price  : 0,
      ratio:  typeof t?.ratio  === 'number' ? t.ratio  : 0,
      reason: typeof t?.reason === 'string' ? t.reason : '',
    }))
  }

  const toRisks = (raw: unknown): string[] => {
    if (!Array.isArray(raw)) return []
    return raw.map((r: any) => (typeof r === 'string' ? r : String(r)))
  }

  const h = (raw: unknown) => (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, any> : {})
  const holding = h(position.holding)

  return {
    ticker:       position.ticker,
    generatedAt:  position.registeredAt.toISOString(),
    summary:      position.summary,
    signal:       VALID_SIGNALS.has(position.signal) ? (position.signal as StrategyResult['signal']) : 'watch',
    buyStrategy: {
      type:           position.entryType === 'lump' ? 'lump' : 'split',
      entries:        toEntries(position.entries),
      stopLoss:       position.stopLoss,
      stopLossReason: position.stopLossReason,
    },
    sellStrategy: { targets: toTargets(position.targets) },
    risks:   toRisks(position.risks),
    holding: {
      minWeeks:        typeof holding.minWeeks    === 'number' ? holding.minWeeks    : 2,
      targetWeeks:     typeof holding.targetWeeks === 'number' ? holding.targetWeeks : 6,
      maxWeeks:        typeof holding.maxWeeks    === 'number' ? holding.maxWeeks    : 12,
      stopCondition:   typeof holding.stopCondition   === 'string' ? holding.stopCondition   : 'MA20 종가 이탈 시 즉시 손절',
      reviewCondition: typeof holding.reviewCondition === 'string' ? holding.reviewCondition : '목표 기간 경과 후 재검토',
    },
    rawText: '',
  }
}

// ─── API Route Handler ───────────────────────────────────────────
export async function POST(req: NextRequest) {
  let snap: IndicatorSnapshot | null = null
  let ticker = 'MOCK'
  let source = 'mock'
  let barsCount = 0

  try {
    const body = await req.json()
    ticker = body.ticker

    if (!ticker || typeof ticker !== 'string') {
      return NextResponse.json({ error: 'ticker 필드 필요' }, { status: 400 })
    }

    ticker = ticker.toUpperCase()
    const forceRefresh = !!body.forceRefresh

    const session = await getServerSession(authOptions)
    const userId = (session?.user as any)?.id as string | undefined

    if (!forceRefresh) {
      // 1순위: DB — 활성 포지션에 저장된 전략
      if (userId) {
        const position = await prisma.position.findFirst({
          where: { userId, ticker, status: 'active' },
        })
        if (position) {
          const result = await fetchStockData(ticker)
          const currentSnap = getSnapshot(result.bars, calcIndicators(result.bars))
          const strategy = parsePositionToStrategy(position)
          return NextResponse.json({ strategy, snapshot: currentSnap, fromDB: true })
        }
      }

      // 2순위: 서버 캐시 (10분 TTL)
      const cached = getCachedStrategy(ticker)
      if (cached) return NextResponse.json({ ...cached, fromCache: true })
    }

    // 1. 주가 데이터 페치
    const result = await fetchStockData(ticker)
    const { bars } = result
    source = result.source
    barsCount = bars.length

    // 2. 지표 계산 및 최신 스냅샷 요약 추출
    const indicators = calcIndicators(bars)
    snap = getSnapshot(bars, indicators)

    // 3. Gemini API 키 및 환경 변수 확인
    const geminiApiKey = process.env.GEMINI_API_KEY
    if (!geminiApiKey) {
      // API 키가 미설정된 경우 예외 발생시켜 즉시 폴백으로 유도
      throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.')
    }

    // 4. 뉴스 + 실적 + 이전 전략 이력 병렬 fetch → 프롬프트 조립
    const [news, earnings, previousHistory] = await Promise.all([
      fetchYahooNews(ticker),
      fetchEarnings(ticker),
      userId ? getStrategyHistory(userId, ticker) : Promise.resolve(null),
    ])

    const previousContext = previousHistory
      ? buildPreviousContext(previousHistory, snap, /^\d{6}$/.test(ticker))
      : ''

    const prompt = buildPrompt(ticker, snap, news, earnings, previousContext)

    // 5. Gemini REST API 호출
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0,
            maxOutputTokens: 1024,
          }
        }),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Gemini REST API 응답 에러 (HTTP ${response.status}): ${errorText}`)
    }

    const resJson = await response.json()
    const rawText = resJson.candidates?.[0]?.content?.parts?.[0]?.text

    if (!rawText) {
      throw new Error('Gemini API 응답에서 분석 결과를 찾을 수 없습니다.')
    }

    // 6. Gemini 응답 파싱 및 결과 구조화
    const strategy = parseStrategyResponse(rawText, ticker)

    // 7. 전략 이력 저장 (로그인 사용자만)
    if (userId) {
      upsertStrategyHistory(userId, ticker, {
        signal:   strategy.signal,
        summary:  strategy.summary,
        price:    snap.close,
        snapshot: snap,
      })
    }

    const responseData = {
      strategy,
      snapshot: snap,
      dataSource: source,
      barsCount: barsCount,
    }
    setCachedStrategy(ticker, responseData)
    return NextResponse.json(responseData)

  } catch (e: any) {
    // ─── API 오류 발생 시 핵심 폴백 처리 ───────────────────
    console.warn(`[API 오류 우회] ${e.message} → 규칙 기반 분석 전략을 대신 제공합니다.`);
    
    // 만약 지표 로드 조차 실패했다면 스냅샷을 최소화된 mock 스냅샷으로 자가 조달
    const fallbackSnap: IndicatorSnapshot = snap ?? {
      close: 100000,
      rsi: 50,
      macd: 0,
      signal: 0,
      histogram: 0,
      bbUpper: 110000,
      bbMid: 100000,
      bbLower: 90000,
      ma5: 100000,
      ma20: 100000,
      ma60: 100000,
      ma120: 100000,
      volumeRatio: 1.0,
      bbPosition: 0.5,
      maCrossState: 'neutral'
    }

    const strategy = generateRuleBasedStrategy(ticker, fallbackSnap)

    return NextResponse.json({
      strategy,
      snapshot: fallbackSnap,
      dataSource: source,
      barsCount: barsCount,
      fallbackMode: true,
      errorMsg: e.message
    })
  }
}

