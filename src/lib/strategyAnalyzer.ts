/**
 * 전략 분석 공유 로직
 * strategy/route.ts 와 recommendations/generate/route.ts 양쪽에서 임포트합니다.
 */
import { fetchStockData } from '@/lib/dataSource'
import { calcIndicators, getSnapshot } from '@/lib/indicators'
import type { StrategyResult, IndicatorSnapshot } from '@/types/stock'

// ─── 타입 ────────────────────────────────────────────────────────

export interface NewsItem {
  title: string
  publisher: string
  date: string
}

export interface EarningsItem {
  period: string
  quarter: string
  epsEstimate: number | null
  epsActual: number | null
  surprisePercent: number | null
}

export interface EarningsData {
  nextEarningsDate: string | null
  epsEstimateNext: number | null
  history: EarningsItem[]
}

export interface AnalysisResult {
  strategy: StrategyResult
  snapshot: IndicatorSnapshot
  source: string
  barsCount: number
  fallbackMode: boolean
}

// ─── Yahoo Finance 데이터 페처 ────────────────────────────────────

export async function fetchEarnings(ticker: string): Promise<EarningsData> {
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
      period:          h.period ?? '',
      quarter:         h.quarter?.fmt ?? '',
      epsEstimate:     h.epsEstimate?.raw ?? null,
      epsActual:       h.epsActual?.raw ?? null,
      surprisePercent: h.surprisePercent?.raw != null
        ? Math.round(h.surprisePercent.raw * 1000) / 10
        : null,
    }))

    return { nextEarningsDate, epsEstimateNext, history }
  } catch {
    return { nextEarningsDate: null, epsEstimateNext: null, history: [] }
  }
}

export async function fetchYahooNews(ticker: string): Promise<NewsItem[]> {
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
        ? new Date(n.providerPublishTime * 1000).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
          })
        : '',
    }))
  } catch {
    return []
  }
}

// ─── 프롬프트 빌더 ───────────────────────────────────────────────

export function buildPrompt(
  ticker: string,
  snap: IndicatorSnapshot,
  news: NewsItem[],
  earnings: EarningsData,
  positionContext = '',
  entryPrice?: number,
): string {
  const isKR = /^\d{6}$/.test(ticker)
  const fmt = (v: number | null, dec = 2) => v == null ? 'N/A' : v.toFixed(dec)
  const pct = (v: number | null) => v == null ? 'N/A' : `${(v * 100).toFixed(1)}%`
  const fmtPrice = (v: number | null) => {
    if (v == null) return 'N/A'
    return isKR ? `${Math.round(v).toLocaleString('ko-KR')}원` : `$${v.toFixed(2)}`
  }

  const hvRatio = snap.hv20 != null && snap.hv60 != null && snap.hv60 > 0
    ? snap.hv20 / snap.hv60 : null

  const regimeLabel: Record<IndicatorSnapshot['volatilityRegime'], string> = {
    low: '저변동성', normal: '정상', high: '고변동성 ⚠️', extreme: '극단적 고변동성 🚨',
  }

  const volatilityBlock =
    (snap.volatilityRegime === 'high' || snap.volatilityRegime === 'extreme') && hvRatio != null
      ? `\n## ⚠️ 고변동성 구간 필수 지시사항\n현재 변동성(HV20)이 평소(HV60) 대비 ${hvRatio.toFixed(1)}배입니다. 아래 규칙을 반드시 따르세요:\n1. risks 배열의 첫 번째 항목에 반드시 "고변동성 경고 — 평소의 ${hvRatio.toFixed(1)}배 수준, 전략 신뢰도 제한적" 포함\n2. buyStrategy.type은 "split" 고정 (lump 절대 금지)\n3. entries는 최소 3개로 분산 진입\n`
      : ''

  const priceUnit = isKR ? '원 단위 정수' : 'USD 소수점 2자리 숫자'
  const currentPrice = snap.close

  const bbPos = snap.bbPosition == null
    ? 'N/A'
    : snap.bbPosition < 0.2 ? `하단 근처 (${pct(snap.bbPosition)})`
    : snap.bbPosition > 0.8 ? `상단 근처 (${pct(snap.bbPosition)})`
    : `중간 (${pct(snap.bbPosition)})`

  const crossLabel = (() => {
    const d = snap.maCrossDaysAgo
    const ago = d != null ? (d === 0 ? ' (오늘 발생)' : ` (${d}거래일 전 발생)`) : ''
    switch (snap.maCrossState) {
      case 'golden': return `골든크로스 발생${ago}`
      case 'dead':   return `데드크로스 발생${ago}`
      case 'above':  return `5일선 > 20일선 유지 중${ago ? ' — 골든크로스' + ago : ''}`
      case 'below':  return `5일선 < 20일선 유지 중${ago ? ' — 데드크로스' + ago : ''}`
      default:       return '중립'
    }
  })()

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
        const actual = e.epsActual   != null ? e.epsActual.toFixed(2)   : 'N/A'
        const est2   = e.epsEstimate != null ? e.epsEstimate.toFixed(2) : 'N/A'
        const surp   = e.surprisePercent != null
          ? ` → 서프라이즈 ${e.surprisePercent > 0 ? '+' : ''}${e.surprisePercent.toFixed(1)}%`
          : ''
        lines.push(`  ${i + 1}. ${e.period} (${e.quarter}): 예상 ${est2} / 실제 ${actual}${surp}`)
      })
    } else {
      lines.push('- 실적 이력 없음')
    }
    return lines.join('\n')
  })()

  const entryPriceBlock = entryPrice != null && currentPrice != null ? (() => {
    const pnlPct = (currentPrice - entryPrice) / entryPrice * 100
    const pnlSign = pnlPct >= 0 ? '+' : ''
    const status = pnlPct >= 0 ? '수익 중' : '손실 중'
    return `\n## 현재 보유 포지션 (사용자 입력)\n- 진입가: ${fmtPrice(entryPrice)}\n- 현재 손익: ${pnlSign}${pnlPct.toFixed(2)}% (${status})\n\n위 포지션 정보를 반드시 반영하세요:\n1. summary에 진입가(${fmtPrice(entryPrice)}) 기준 현재 ${status}(${pnlSign}${pnlPct.toFixed(2)}%) 상태를 언급하고, 추가매수·보유·손절 중 어떤 행동을 권고하는지 명시할 것\n2. stopLoss는 진입가(${fmtPrice(entryPrice)}) 대비 적정 리스크(-3~-8% 범위 내)를 고려하여 설정할 것\n3. 손실 중이라면 추가 평단 인하 가능 여부와 리스크를 risks에 포함할 것\n4. 수익 중이라면 일부 익절 시점을 targets에 반영할 것`
  })() : ''

  return `
당신은 주식 기술적 분석 + 뉴스 감성 분석 + 실적 분석 전문가입니다.
아래 기술적 지표, 최근 뉴스, 실적 발표 데이터를 종합 분석하여 매매 전략을 수립하세요.
뉴스의 긍정·부정 sentiment 및 실적 서프라이즈가 기술적 신호와 충돌하면 이를 반드시 반영하고 risks에 명시하세요.

## 종목 정보
- 티커: ${ticker}
- 현재가: ${fmtPrice(currentPrice)}
- 가격 단위: ${priceUnit} (JSON 내 모든 price 필드에 이 단위를 사용할 것)
${entryPriceBlock}
${positionContext}

## 기술적 지표 (일봉 기준 최신값)
- RSI(14): ${fmt(snap.rsi, 1)}${snap.rsi == null ? '' : snap.rsi < 30 ? ' ⚠️ 과매도' : snap.rsi > 70 ? ' ⚠️ 과매수' : ''}
- MACD: ${fmt(snap.macd)} / 시그널: ${fmt(snap.signal)} / 히스토그램: ${fmt(snap.histogram)}
- 볼린저 밴드: 상단 ${fmtPrice(snap.bbUpper)} / 중심 ${fmtPrice(snap.bbMid)} / 하단 ${fmtPrice(snap.bbLower)}
- 밴드 내 위치: ${bbPos}
- BB 폭 비율 (현재/20일평균): ${fmt(snap.bbWidthRatio, 2)}배${snap.bbWidthRatio != null && snap.bbWidthRatio > 1.5 ? ' (급팽창 중)' : ''}
- 이동평균: MA5 ${fmtPrice(snap.ma5)} / MA20 ${fmtPrice(snap.ma20)} / MA60 ${fmtPrice(snap.ma60)} / MA120 ${fmtPrice(snap.ma120)}
- 이동평균 크로스: ${crossLabel}
- 거래량 비율 (최근5일/20일평균): ${fmt(snap.volumeRatio, 2)}배
- 역사적 변동성: HV20 ${fmt(snap.hv20, 1)}% / HV60 ${fmt(snap.hv60, 1)}% (비율 ${hvRatio != null ? hvRatio.toFixed(1) : 'N/A'}배)
- 변동성 구간: ${regimeLabel[snap.volatilityRegime]}

## 최근 뉴스 (Yahoo Finance)
${newsSection}

## 실적 발표 데이터 (Yahoo Finance)
${earningsSection}
${volatilityBlock}
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
2. lump 조건: 강한 모멘텀 (거래량 급증 + 골든크로스 + RSI 50~65) AND 긍정적/중립 뉴스 AND 변동성 구간 정상
3. 볼린저 밴드 하단 판단 기준 (BB 폭 비율 참고):
   - BB 폭 비율 < 1.5 (정상/수축) → 평균 회귀 가능성 고려 → 분할 매수 검토
   - BB 폭 비율 ≥ 1.5 (급팽창 중) + 거래량 급증 → 추세 하락 가능성 → 평균 회귀 가정 보류, 관망 우선
4. 목표가 근거 규칙 (가장 중요):
   - targets의 reason은 반드시 구체적인 기술적 레벨을 명시할 것
     예시 (O): "MA60(${fmtPrice(snap.ma60)}) 저항선 도달", "볼린저 밴드 상단(${fmtPrice(snap.bbUpper)}) 저항", "MA20(${fmtPrice(snap.ma20)}) 단기 저항선"
     예시 (X): "+5% 수익 실현 구간", "+12% 목표가", "단기 익절 구간" — 단순 수익률 표기는 근거가 아니므로 절대 금지
   - 1차 목표가는 가능하면 MA60(${fmtPrice(snap.ma60)}) 또는 BB 중심선(${fmtPrice(snap.bbMid)}) 근처로 설정
   - 2차 목표가는 MA60(${fmtPrice(snap.ma60)}) 또는 BB 상단(${fmtPrice(snap.bbUpper)}) 근처로 설정
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
13. 실적 발표 반영 규칙:
    - 다음 실적 발표일이 2주 이내면 risks에 "실적 발표 이벤트 리스크 — [날짜]" 반드시 포함
    - 최근 EPS 서프라이즈가 연속 2회 이상 +10% 초과 시 signal 상향 가중 가능
    - 최근 EPS 서프라이즈가 -10% 이하 발생 시 signal 하향 가중 및 risks에 포함
    - 실적 이력이 없으면 해당 규칙은 무시하고 기술적 지표만으로 판단
`
}

// ─── Gemini 응답 파서 ────────────────────────────────────────────

export function parseStrategyResponse(raw: string, ticker: string): StrategyResult {
  const isKR = /^\d{6}$/.test(ticker)

  const sanitizePrice = (v: any): number => {
    if (typeof v === 'number' && isFinite(v))
      return isKR ? Math.round(v) : Math.round(v * 100) / 100
    if (typeof v === 'string') {
      const n = parseFloat(v.replace(/[^0-9.]/g, ''))
      if (!isNaN(n)) return isKR ? Math.round(n) : Math.round(n * 100) / 100
    }
    return 0
  }

  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()

  let parsed: any
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    return {
      ticker,
      generatedAt: new Date().toISOString(),
      summary: 'API 분석 결과를 파싱하는 데 실패했습니다.',
      signal: 'watch',
      buyStrategy: { type: 'split', entries: [], stopLoss: 0, stopLossReason: '파싱 실패로 산출 불가' },
      sellStrategy: { targets: [] },
      risks: ['응답 데이터 파싱 실패', '일시적인 API 응답 규격 오류'],
      holding: { minWeeks: 2, targetWeeks: 6, maxWeeks: 12, stopCondition: 'MA20 이탈 시 손절', reviewCondition: '6주 경과 후 재검토' },
      rawText: raw,
    }
  }

  return {
    ticker,
    generatedAt: new Date().toISOString(),
    summary: parsed.summary ?? '요약 제공 불가.',
    signal: parsed.signal ?? 'watch',
    buyStrategy: (() => {
      const stopLoss = sanitizePrice(parsed.buyStrategy?.stopLoss)
      const entries = (parsed.buyStrategy?.entries ?? [])
        .map((e: any) => ({ ...e, price: sanitizePrice(e.price) }))
        .filter((e: any) => e.price > stopLoss)
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
      reviewCondition: parsed.holding?.reviewCondition ?? '목표 기간 경과 후 재검토',
    },
    rawText: raw,
  }
}

// ─── 규칙 기반 폴백 전략 ─────────────────────────────────────────

export function generateRuleBasedStrategy(ticker: string, snap: IndicatorSnapshot): StrategyResult {
  const isKR  = /^\d{6}$/.test(ticker)
  const price  = snap.close
  const rsi    = snap.rsi ?? 50
  const bbPos  = snap.bbPosition ?? 0.5

  const rsiScore   = rsi < 30 ? 2 : rsi < 40 ? 1 : rsi > 70 ? -2 : rsi > 60 ? -1 : 0
  const bbScore    = bbPos < 0.15 ? 2 : bbPos < 0.35 ? 1 : bbPos > 0.85 ? -2 : bbPos > 0.65 ? -1 : 0
  const macdScore  = (() => {
    if (snap.macd == null || snap.signal == null) return 0
    if (snap.macd > snap.signal && (snap.histogram ?? 0) > 0) return 1
    if (snap.macd < snap.signal && (snap.histogram ?? 0) < 0) return -1
    return 0
  })()
  const crossScore = (snap.maCrossState === 'golden' || snap.maCrossState === 'above') ? 1
    : (snap.maCrossState === 'dead' || snap.maCrossState === 'below') ? -1 : 0
  const baseScore  = rsiScore + bbScore + macdScore + crossScore
  const volScore   = (() => {
    if ((snap.volumeRatio ?? 0) < 1.5) return 0
    return baseScore > 0 ? 1 : baseScore < 0 ? -1 : 0
  })()
  const totalScore = baseScore + volScore

  const signal: StrategyResult['signal'] =
    totalScore >= 5  ? 'strong_buy'  :
    totalScore >= 3  ? 'buy'         :
    totalScore <= -5 ? 'strong_sell' :
    totalScore <= -3 ? 'sell'        : 'watch'

  const r = (v: number) => isKR ? Math.round(v) : Math.round(v * 100) / 100
  const support = snap.ma20 != null && snap.ma20 < price ? snap.ma20 : snap.bbLower != null ? snap.bbLower : price * 0.95
  const resist  = snap.ma60 != null && snap.ma60 > price ? snap.ma60 : snap.bbUpper != null ? snap.bbUpper : price * 1.08
  const ma20Str = snap.ma20 != null ? (isKR ? `${Math.round(snap.ma20).toLocaleString('ko-KR')}원` : `$${snap.ma20.toFixed(2)}`) : '근처'
  const ma60Str = snap.ma60 != null ? (isKR ? `${Math.round(snap.ma60).toLocaleString('ko-KR')}원` : `$${snap.ma60.toFixed(2)}`) : '근처'

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

  let summary: string
  let entries: StrategyResult['buyStrategy']['entries']
  let stopLoss: number
  let stopLossReason: string
  let targets: StrategyResult['sellStrategy']['targets']
  let risks: string[]

  if (signal === 'strong_buy') {
    summary = `${ticker}: ${bullCues.join(' · ')} 동시 발생 — 복수 지표 강한 매수 신호. (종합 점수 ${totalScore}/7)`
    entries = [
      { price: r(price * 0.99), ratio: 40, reason: `1차 — ${bullCues[0] ?? 'BB 하단 근접'}` },
      { price: r(Math.min(price * 0.96, support * 1.01)), ratio: 60, reason: `2차 — MA20(${ma20Str}) 지지 확인 비중 확대` },
    ]
    stopLoss = r(support * 0.97); stopLossReason = `MA20(${ma20Str}) 하향 이탈 시 손절`
    targets = [
      { price: r(price * 1.07), ratio: 50, reason: 'BB 중심선 도달 1차 익절' },
      { price: r(Math.max(resist, price * 1.14)), ratio: 50, reason: `MA60(${ma60Str}) 저항 돌파 시 전량 익절` },
    ]
    risks = [
      bearCues.length > 0 ? `반대 지표 혼재: ${bearCues.join(', ')}` : '기술적 반등 실패 가능성',
      (snap.volumeRatio ?? 1) < 0.8 ? '거래량 부족 — 매수세 유입 불확실' : '외부 충격에 따른 지지선 붕괴 리스크',
      '과매도 구간 진입 후 추가 하락 지속 가능성 (칼날 받기)',
    ]
  } else if (signal === 'buy') {
    summary = `${ticker}: ${bullCues.join(' · ')} 확인 — 단기 조정 후 지지 구간 분할 매수 유효. (종합 점수 ${totalScore}/7)`
    entries = [
      { price: r(price * 0.99), ratio: 50, reason: `1차 — ${bullCues[0] ?? '현재가 근처'}` },
      { price: r(Math.min(price * 0.96, support * 1.005)), ratio: 50, reason: `2차 — MA20(${ma20Str}) 지지 후 추가` },
    ]
    stopLoss = r(support * 0.96); stopLossReason = `MA20(${ma20Str}) 붕괴 시 손절`
    targets = [
      { price: r(price * 1.06), ratio: 60, reason: '단기 저항 1차 익절' },
      { price: r(Math.max(resist, price * 1.12)), ratio: 40, reason: `MA60(${ma60Str}) 중기 저항 2차 익절` },
    ]
    risks = [
      crossScore < 0 ? '데드크로스 진행 중 — 중기 하락 우려' : '단기 반등 후 재하락 가능성',
      (snap.volumeRatio ?? 1) < 1.0 ? '거래량 감소 — 상승 지속 불확실' : '매물대 저항에 따른 상승 제한',
      '섹터 전반 기관·외인 매도세 리스크',
    ]
  } else if (signal === 'strong_sell') {
    summary = `${ticker}: ${bearCues.join(' · ')} 동시 발생 — 현재 진입 비추천. 큰 폭 하락 후 재진입 대기 권고. (종합 점수 ${totalScore}/7)`
    entries = [{ price: r(price * 0.88), ratio: 100, reason: `급락 후 MA60(${ma60Str}) 근처에서만 보수적 재진입 검토` }]
    stopLoss = r(price * 0.82); stopLossReason = '추세 완전 이탈 시 즉시 손절'; targets = []
    risks = [
      `${bearCues.join(' · ')} — 복수 지표 동시 약세`,
      (snap.volumeRatio ?? 0) > 1.5 ? '높은 거래량 동반 하락 — 투매 징후' : '고점 매수자 차익 매물 출회 우려',
      '단기 과열 해소 이후에도 중기 하락 추세 전환 가능성',
    ]
  } else if (signal === 'sell') {
    summary = `${ticker}: ${bearCues.join(' · ')} — 현재 진입 비추천. 조정 대기 후 매수 검토. (종합 점수 ${totalScore}/7)`
    entries = [{ price: r(price * 0.93), ratio: 100, reason: `조정 후 MA20(${ma20Str}) 지지 확인 시 재진입` }]
    stopLoss = r(price * 0.87); stopLossReason = `MA20(${ma20Str}) 붕괴 시 추가 하락 대비 손절`
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
    const mixed = bullCues.length > 0 && bearCues.length > 0
    summary = mixed
      ? `${ticker}: ${bullCues.join(' · ')} vs ${bearCues.join(' · ')} 혼재 — 방향성 확인 후 진입 권고. (종합 점수 ${totalScore}/7)`
      : `${ticker}: RSI ${rsi.toFixed(1)}, BB 중간 구간. 특별한 방향성 신호 없음 — 추세 돌파 확인 후 진입 권고.`
    entries = [
      { price: r(Math.min(price * 0.97, support * 1.01)), ratio: 50, reason: `MA20(${ma20Str}) 지지 확인 시 1차 진입` },
      { price: r(Math.min(price * 0.94, support * 0.98)), ratio: 50, reason: '하방 2차 분할 진입' },
    ]
    stopLoss = r(support * 0.95); stopLossReason = `박스권 하향 이탈 및 MA20(${ma20Str}) 붕괴 시 손절`
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
    strong_buy: { minWeeks: 2, targetWeeks: 8, maxWeeks: 16 },
    buy:        { minWeeks: 2, targetWeeks: 6, maxWeeks: 12 },
    watch:      { minWeeks: 1, targetWeeks: 4, maxWeeks: 8  },
    sell:       { minWeeks: 1, targetWeeks: 2, maxWeeks: 4  },
    strong_sell:{ minWeeks: 1, targetWeeks: 2, maxWeeks: 4  },
  }
  const h = holdingMap[signal]

  return {
    ticker, generatedAt: new Date().toISOString(), summary, signal,
    buyStrategy: { type: 'split', entries, stopLoss, stopLossReason },
    sellStrategy: { targets },
    risks,
    holding: {
      ...h,
      stopCondition:   `MA20(${ma20Str}) 종가 이탈 시 즉시 손절 — 단기 추세선 붕괴`,
      reviewCondition: `${h.targetWeeks}주 경과 후 1차 목표 미달 시 전략 재수립 (시간 손절)`,
    },
    rawText: `[폴백 모드 — 규칙 기반 엔진]\n점수: RSI ${rsiScore} + BB ${bbScore} + MACD ${macdScore} + MA크로스 ${crossScore} + 거래량 ${volScore} = 종합 ${totalScore}/7\n판정: ${signal.toUpperCase()}`,
  }
}

// ─── 전략 분석 오케스트레이터 ────────────────────────────────────

export async function runStrategyAnalysis(
  ticker: string,
  geminiApiKey: string | undefined,
): Promise<AnalysisResult> {
  const { bars, source } = await fetchStockData(ticker)
  const snap = getSnapshot(bars, calcIndicators(bars))

  if (!geminiApiKey) {
    return { strategy: generateRuleBasedStrategy(ticker, snap), snapshot: snap, source, barsCount: bars.length, fallbackMode: true }
  }

  try {
    const [news, earnings] = await Promise.all([fetchYahooNews(ticker), fetchEarnings(ticker)])
    const prompt = buildPrompt(ticker, snap, news, earnings)

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0, maxOutputTokens: 2048 },
        }),
        signal: AbortSignal.timeout(30000),
      }
    )

    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`)
    const json = await res.json()
    const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text
    if (!rawText) throw new Error('Gemini 응답 없음')

    return {
      strategy: parseStrategyResponse(rawText, ticker),
      snapshot: snap,
      source,
      barsCount: bars.length,
      fallbackMode: false,
    }
  } catch {
    return { strategy: generateRuleBasedStrategy(ticker, snap), snapshot: snap, source, barsCount: bars.length, fallbackMode: true }
  }
}
