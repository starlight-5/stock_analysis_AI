import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { fetchStockData } from '@/lib/dataSource'
import { calcIndicators, getSnapshot } from '@/lib/indicators'
import {
  fetchYahooNews,
  fetchEarnings,
  buildPrompt,
  parseStrategyResponse,
  generateRuleBasedStrategy,
} from '@/lib/strategyAnalyzer'
import type { StrategyResult, IndicatorSnapshot } from '@/types/stock'

// ─── 전략 캐시 (10분 TTL) ────────────────────────────────────────
;(globalThis as any).__strategyCache ??= new Map()
const strategyCache: Map<string, { data: object; expiresAt: number }> =
  (globalThis as any).__strategyCache
const STRATEGY_TTL_MS = 10 * 60 * 1000

function getCachedStrategy(key: string) {
  const entry = strategyCache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) { strategyCache.delete(key); return null }
  return entry.data
}
function setCachedStrategy(key: string, data: object) {
  strategyCache.set(key, { data, expiresAt: Date.now() + STRATEGY_TTL_MS })
}

// ─── DB 포지션 → StrategyResult 변환 ────────────────────────────────
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
  const toArr = <T>(raw: unknown, map: (x: any) => T): T[] =>
    Array.isArray(raw) ? raw.map(map) : []
  const h = (raw: unknown): Record<string, any> =>
    raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, any> : {}
  const holding = h(position.holding)
  return {
    ticker:      position.ticker,
    generatedAt: position.registeredAt.toISOString(),
    summary:     position.summary,
    signal:      VALID_SIGNALS.has(position.signal) ? (position.signal as StrategyResult['signal']) : 'watch',
    buyStrategy: {
      type:           position.entryType === 'lump' ? 'lump' : 'split',
      entries:        toArr(position.entries, (e: any) => ({ price: e?.price ?? 0, ratio: e?.ratio ?? 0, reason: e?.reason ?? '' })),
      stopLoss:       position.stopLoss,
      stopLossReason: position.stopLossReason,
    },
    sellStrategy: { targets: toArr(position.targets, (t: any) => ({ price: t?.price ?? 0, ratio: t?.ratio ?? 0, reason: t?.reason ?? '' })) },
    risks:   toArr(position.risks, (r: any) => (typeof r === 'string' ? r : String(r))),
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

// ─── 포지션 → Gemini 프롬프트 컨텍스트 변환 ─────────────────────────
function buildPositionContext(position: {
  registeredAt: Date
  signal: string
  summary: string
  entryType: string
  entries: unknown
  stopLoss: number
  stopLossReason: string
}, isKR: boolean): string {
  const fmtPrice = (v: number) =>
    isKR ? `${Math.round(v).toLocaleString('ko-KR')}원` : `$${v.toFixed(2)}`

  const daysSince = Math.floor((Date.now() - position.registeredAt.getTime()) / (1000 * 60 * 60 * 24))

  const entriesText = Array.isArray(position.entries)
    ? (position.entries as any[]).map((e: any, i: number) =>
        `  ${i + 1}차: ${fmtPrice(e.price ?? 0)} (${e.ratio ?? 0}%)`
      ).join('\n')
    : '정보 없음'

  return `
## 기존 등록 포지션 (${daysSince}일 전 등록)
- 등록 당시 판정: ${position.signal.toUpperCase()}
- 매수 유형: ${position.entryType === 'lump' ? '일괄 매수' : '분할 매수'}
- 추천 진입가:
${entriesText}
- 손절선: ${fmtPrice(position.stopLoss)} (${position.stopLossReason})
- 당시 요약: ${position.summary}

위 포지션을 보유 중인 상황에서 현재 시황을 재분석하세요:
1. summary에 등록 당시(${position.signal}) 대비 현재 시황 변화를 반드시 언급하고, 보유 유지·추가매수·손절 중 명확한 행동을 권고할 것
2. stopLoss는 등록 당시 손절선(${fmtPrice(position.stopLoss)}) 및 현재 지지선을 함께 고려하여 설정할 것
3. targets는 현재 기술적 레벨 기준으로 재설정할 것`
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
    const isKR = /^\d{6}$/.test(ticker)
    const forceRefresh = !!body.forceRefresh
    const entryPrice: number | undefined =
      typeof body.entryPrice === 'number' && isFinite(body.entryPrice) && body.entryPrice > 0
        ? body.entryPrice
        : undefined

    const session = await getServerSession(authOptions)
    const userId = (session?.user as any)?.id as string | undefined

    if (!forceRefresh) {
      // 1순위: DB 포지션 전략
      if (userId) {
        const position = await prisma.position.findFirst({
          where: { userId, ticker, status: 'active' },
        })
        if (position) {
          const result = await fetchStockData(ticker)
          const currentSnap = getSnapshot(result.bars, calcIndicators(result.bars))
          return NextResponse.json({ strategy: parsePositionToStrategy(position), snapshot: currentSnap, fromDB: true })
        }
      }
      // 2순위: 서버 캐시
      const cached = getCachedStrategy(ticker)
      if (cached) return NextResponse.json({ ...cached, fromCache: true })
      // 데이터 없음 → 빈 화면
      return NextResponse.json({ strategy: null, snapshot: null })
    }

    // forceRefresh=true: 포지션 컨텍스트 포함하여 Gemini 분석
    let positionContext = ''
    if (userId) {
      const position = await prisma.position.findFirst({
        where: { userId, ticker, status: 'active' },
      })
      if (position) positionContext = buildPositionContext(position, isKR)
    }

    // 1. 주가 데이터 페치
    const result = await fetchStockData(ticker)
    const { bars } = result
    source = result.source
    barsCount = bars.length

    // 2. 지표 계산
    const indicators = calcIndicators(bars)
    snap = getSnapshot(bars, indicators)

    // 3. Gemini API 키 확인
    const geminiApiKey = process.env.GEMINI_API_KEY
    if (!geminiApiKey) throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.')

    // 4. 뉴스 + 실적 병렬 fetch
    const [news, earnings] = await Promise.all([fetchYahooNews(ticker), fetchEarnings(ticker)])

    const prompt = buildPrompt(ticker, snap, news, earnings, positionContext, entryPrice)

    // 5. Gemini REST API 호출
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0, maxOutputTokens: 2048 },
        }),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Gemini REST API 에러 (HTTP ${response.status}): ${errorText}`)
    }

    const resJson = await response.json()
    const rawText = resJson.candidates?.[0]?.content?.parts?.[0]?.text
    if (!rawText) throw new Error('Gemini API 응답에서 분석 결과를 찾을 수 없습니다.')

    // 6. 파싱 및 응답
    const strategy = parseStrategyResponse(rawText, ticker)
    const responseData = { strategy, snapshot: snap, dataSource: source, barsCount }
    setCachedStrategy(ticker, responseData)
    return NextResponse.json(responseData)

  } catch (e: any) {
    console.warn(`[API 오류 우회] ${e.message} → 규칙 기반 분석 전략을 대신 제공합니다.`)

    const fallbackSnap: IndicatorSnapshot = snap ?? {
      close: 100000, rsi: 50, macd: 0, signal: 0, histogram: 0,
      bbUpper: 110000, bbMid: 100000, bbLower: 90000,
      ma5: 100000, ma20: 100000, ma60: 100000, ma120: 100000,
      volumeRatio: 1.0, bbPosition: 0.5, maCrossState: 'neutral', maCrossDaysAgo: null,
      hv20: null, hv60: null, volatilityRegime: 'normal', bbWidthRatio: null,
      adx: null, adxTrend: null, atr14: null, obvDivergence: 'none', fibLevels: null,
    }

    return NextResponse.json({
      strategy: generateRuleBasedStrategy(ticker, fallbackSnap),
      snapshot: fallbackSnap,
      dataSource: source,
      barsCount,
      fallbackMode: true,
      errorMsg: e.message,
    })
  }
}
