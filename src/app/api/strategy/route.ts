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
import { fetchStockData } from '@/lib/dataSource'
import { calcIndicators, getSnapshot } from '@/lib/indicators'
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

function buildPrompt(ticker: string, snap: IndicatorSnapshot, news: NewsItem[]): string {
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

  return `
당신은 주식 기술적 분석 + 뉴스 감성 분석 전문가입니다.
아래 기술적 지표와 최근 뉴스를 종합 분석하여 매매 전략을 수립하세요.
뉴스의 긍정·부정 sentiment가 기술적 신호와 충돌하면 이를 반드시 반영하고 risks에 명시하세요.

## 종목 정보
- 티커: ${ticker}
- 현재가: ${fmtPrice(currentPrice)}
- 가격 단위: ${priceUnit} (JSON 내 모든 price 필드에 이 단위를 사용할 것)

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
      { "price": ${priceUnit}, "ratio": 비중(0-100), "reason": "목표가 근거" }
    ]
  },
  "risks": ["리스크 1 (가능하면 뉴스 근거 포함)", "리스크 2", "리스크 3"]
}

## 전략 작성 규칙
1. split 조건: RSI < 40 또는 하락 추세 또는 BB 하단 근처 또는 부정적 뉴스 존재 → 2~3회 분할 진입
2. lump 조건: 강한 모멘텀 (거래량 급증 + 골든크로스 + RSI 50~65) AND 긍정적/중립 뉴스
3. 1차 목표: +5~8%, 2차 목표: +12~20%
4. 손절선: -5~8% 범위 내 주요 지지선
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
      rawText: raw,
    }
  }

  return {
    ticker,
    generatedAt: new Date().toISOString(),
    summary: parsed.summary ?? '주식 기술 지표 요약 제공 불가.',
    signal: parsed.signal ?? 'watch',
    buyStrategy: {
      type: parsed.buyStrategy?.type ?? 'split',
      entries: (parsed.buyStrategy?.entries ?? [])
        .map((e: any) => ({ ...e, price: sanitizePrice(e.price) }))
        .sort((a: any, b: any) => b.price - a.price),
      stopLoss: sanitizePrice(parsed.buyStrategy?.stopLoss),
      stopLossReason: parsed.buyStrategy?.stopLossReason ?? '리스크 한도 초과 시 손절',
    },
    sellStrategy: {
      targets: (parsed.sellStrategy?.targets ?? [])
        .map((t: any) => ({ ...t, price: sanitizePrice(t.price) }))
        .sort((a: any, b: any) => a.price - b.price),
    },
    risks: parsed.risks ?? ['시장 변동성 리스크', '종목 개별 재무 위험', '추세 반전 우려'],
    rawText: raw,
  }
}

// ─── 규칙 기반(Rule-based) 백업 전략 생성기 (폴백) ────────────────────
/**
 * Gemini API Key가 잘못되었거나, 무료 쿼터 제한(Rate Limit)을 넘는 비상 상황 시
 * 현재 보조지표 데이터를 바탕으로 즉각적인 투자 분석을 자체 조달하는 핵심 폴백 함수입니다.
 */
function generateRuleBasedStrategy(ticker: string, snap: IndicatorSnapshot): StrategyResult {
  const price = snap.close
  const rsi = snap.rsi ?? 50
  const bbPos = snap.bbPosition ?? 0.5
  
  let signal: StrategyResult['signal'] = 'watch'
  let summary = ''
  let buyType: 'lump' | 'split' = 'split'
  let entries: StrategyResult['buyStrategy']['entries'] = []
  let stopLoss = Math.round(price * 0.94)
  let stopLossReason = '직전 최근 지지선 붕괴 및 하방 리스크 대응을 위한 손절 가이드 적용'
  let targets: StrategyResult['sellStrategy']['targets'] = []
  let risks: string[] = []

  // 지표 판정 분기
  if (rsi < 30 || bbPos < 0.15) {
    // 1. 과매도 / 볼린저 밴드 하단 근접 (강력 매수 신호)
    signal = 'strong_buy'
    summary = `현재 ${ticker} 종목은 RSI(${rsi.toFixed(1)}) 지표가 심각한 과매도 상태이며 주가가 볼린저 밴드 하단에 인접해 있습니다. 기술적 과매도로 인한 저가 매수 유입 가능성이 매우 높습니다.`
    buyType = 'split'
    entries = [
      { price: Math.round(price * 0.99), ratio: 40, reason: '현재가 근처 분할 1차 진입' },
      { price: Math.round(price * 0.96), ratio: 60, reason: '강력 지지선 부근 비중 확대 진입' }
    ]
    stopLoss = Math.round(price * 0.92)
    stopLossReason = '과매도 이탈 후 추가 하락 시 지지 실패로 판단하여 손절'
    targets = [
      { price: Math.round(price * 1.07), ratio: 50, reason: '1차 볼린저 밴드 중심선 도달 시 차익실현' },
      { price: Math.round(price * 1.15), ratio: 50, reason: '2차 상단 저항선 돌파 시 전량 차익실현' }
    ]
    risks = [
      '하락 추세 지속 시 단기 추가 낙폭 발생 리스크',
      '거래량 공백으로 인한 매수세 유입 지연 가능성',
      '글로벌 거시경제 악화에 따른 기술적 반등 무산 리스크'
    ]
  } else if (rsi < 45 || bbPos < 0.35) {
    // 2. 조정 후 지지 매수
    signal = 'buy'
    summary = `주가가 완만한 단기 조정 후 지지 라인을 확보하는 형태입니다. RSI(${rsi.toFixed(1)}) 수준이 낮아 분할 매수로 신규 진입하기에 유리한 국면입니다.`
    buyType = 'split'
    entries = [
      { price: Math.round(price * 0.98), ratio: 50, reason: '지지선 1차 매수 진입' },
      { price: Math.round(price * 0.95), ratio: 50, reason: '하방 지지 2차 매수 진입' }
    ]
    stopLoss = Math.round(price * 0.93)
    stopLossReason = '주요 매물대 하단선 붕괴에 따른 리스크 차단'
    targets = [
      { price: Math.round(price * 1.06), ratio: 60, reason: '1차 목표 저항 매물대 익절' },
      { price: Math.round(price * 1.12), ratio: 40, reason: '2차 추세 연장선 상단 익절' }
    ]
    risks = [
      '단기 횡보 박스권 장기화에 따른 기회비용 리스크',
      '지표 개선 흐름의 변동성 발생 우려',
      '섹터 전반의 기관/외인 동반 매도세 리스크'
    ]
  } else if (rsi > 70 || bbPos > 0.85) {
    // 3. 과매수 / 밴드 상단 이탈 (강력 매도 신호)
    signal = 'strong_sell'
    summary = `RSI 지표가 ${rsi.toFixed(1)} 수준으로 단기 과열 양상에 직면했으며 볼린저 밴드 상단 경계를 넘나들고 있습니다. 단기 차익 실현 매물 폭탄의 위험성이 농후합니다.`
    buyType = 'split'
    entries = [
      { price: Math.round(price * 0.88), ratio: 100, reason: '낙폭 과대 시 20일선 근처에서만 보수적 매수 대기' }
    ]
    stopLoss = Math.round(price * 0.82)
    stopLossReason = '추세 완전히 이탈 및 붕괴 시 칼손절'
    targets = [
      { price: Math.round(price * 1.02), ratio: 100, reason: '현재 구간에서 적극적인 비중 축소 및 전량 익절 권장' }
    ]
    risks = [
      '단기 추세 꺾임 시 매도 물량 급증에 따른 투매 리스크',
      '고점 매수자들의 차익 매물 대거 출회 우려',
      '신규 진입 시 뇌동매매에 따른 고점 물리 가능성 매우 높음'
    ]
  } else if (rsi > 58 || bbPos > 0.65) {
    // 4. 상승 모멘텀 유지 중 일부 비중 축소 권장
    signal = 'sell'
    summary = `주가가 견조한 상승세를 유지하고 있으나, RSI(${rsi.toFixed(1)}) 지표 상 점차 매수 세력이 약화되는 과열 권역에 진입하고 있어 분할 매도를 시작할 타이밍입니다.`
    buyType = 'split'
    entries = [
      { price: Math.round(price * 0.92), ratio: 100, reason: '조정 시 지지선 확인 후 보수적 접근' }
    ]
    stopLoss = Math.round(price * 0.87)
    stopLossReason = '지지 라인 붕괴 시 추세 이탈로 판단'
    targets = [
      { price: Math.round(price * 1.04), ratio: 50, reason: '직전 최고점 저항 돌파 실패 시 분할 익절' },
      { price: Math.round(price * 1.08), ratio: 50, reason: '추가 오버슈팅 시 남은 비중 전량 익절' }
    ]
    risks = [
      '단기 고점 형성 후 차익 매물 출회에 따른 조정 위험',
      '최근 가팔랐던 거래량 상승 탄력 둔화 우려',
      '외국인 순매수세 둔화에 따른 상승동력 상실'
    ]
  } else {
    // 5. 방향성 탐색 구간 (관망)
    signal = 'watch'
    summary = `현재 ${ticker} 종목은 특별한 모멘텀 없이 박스권 횡보 양상을 띠고 있습니다. RSI(${rsi.toFixed(1)}) 수치가 50선 근방에 위치하여 방향성 돌파 여부 확인이 선행되어야 합니다.`
    buyType = 'split'
    entries = [
      { price: Math.round(price * 0.96), ratio: 50, reason: '박스권 하단 지지 확인 시 매수 진입' },
      { price: Math.round(price * 0.93), ratio: 50, reason: '하방 지지 2차 매수 진입' }
    ]
    stopLoss = Math.round(price * 0.89)
    stopLossReason = '박스권 하향 돌파 시 추가 하락 리스크 관리용 손절'
    targets = [
      { price: Math.round(price * 1.04), ratio: 50, reason: '박스권 상단 저항선 1차 익절' },
      { price: Math.round(price * 1.09), ratio: 50, reason: '박스권 돌파 후 추가 상승 마디가 2차 익절' }
    ]
    risks = [
      '방향성 부재에 따른 지루한 시간 횡보 기회비용 리스크',
      '박스권 위아래 변동폭 축소에 따른 단기 트레이딩 마진 감소',
      '시장 수급 관망세 집중으로 거래량 침체 장기화'
    ]
  }

  return {
    ticker,
    generatedAt: new Date().toISOString(),
    summary,
    signal,
    buyStrategy: {
      type: buyType,
      entries,
      stopLoss,
      stopLossReason
    },
    sellStrategy: {
      targets
    },
    risks,
    rawText: `[폴백 모드 활성화 - 규칙 기반 엔진]
* 원인: Gemini API 미연동 또는 API 오류
* 진단: RSI: ${rsi.toFixed(2)}, Bollinger Position: ${(bbPos * 100).toFixed(1)}%
* 판정 결과: ${signal.toUpperCase()} 전략 수립 완료.`
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

    // 캐시 히트 확인 (10분 TTL) — forceRefresh 시 건너뜀
    if (!forceRefresh) {
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

    // 4. 뉴스 + 프롬프트 조립 (뉴스 실패해도 분석 계속)
    const news   = await fetchYahooNews(ticker)
    const prompt = buildPrompt(ticker, snap, news)

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

