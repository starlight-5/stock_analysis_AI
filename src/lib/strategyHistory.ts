/**
 * 전략 이력 (StrategyHistory) 보조 함수 모음
 *
 * Gemini 분석 시 직전 판정을 DB에 저장하고,
 * 다음 분석 시 지표 변화를 프롬프트에 포함시켜 AI 정확도를 높인다.
 * 레코드는 (userId, ticker) 복합 키로 upsert되며, 1 row = 1종목 최신이력.
 */
import { prisma } from './prisma'
import type { IndicatorSnapshot } from '@/types/stock'

export interface StrategyHistoryRecord {
  signal: string
  summary: string
  price: number
  snapshot: IndicatorSnapshot
  generatedAt: Date
}

/** DB에서 특정 사용자·종목의 최신 전략 이력 조회. 없으면 null 반환. */
export async function getStrategyHistory(
  userId: string,
  ticker: string
): Promise<StrategyHistoryRecord | null> {
  try {
    const record = await prisma.strategyHistory.findUnique({
      where: { userId_ticker: { userId, ticker } },
    })
    if (!record) return null
    return {
      signal:      record.signal,
      summary:     record.summary,
      price:       record.price,
      snapshot:    record.snapshot as unknown as IndicatorSnapshot,
      generatedAt: record.generatedAt,
    }
  } catch {
    return null
  }
}

/** 직전 전략 이력을 DB에 저장(upsert). 실패 시 경고만 하고 진행 방해하지 않음. */
export async function upsertStrategyHistory(
  userId: string,
  ticker: string,
  data: { signal: string; summary: string; price: number; snapshot: IndicatorSnapshot }
): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snapshot = data.snapshot as any
    await prisma.strategyHistory.upsert({
      where:  { userId_ticker: { userId, ticker } },
      update: { ...data, snapshot, generatedAt: new Date() },
      create: { userId, ticker, ...data, snapshot },
    })
  } catch (e) {
    console.warn('[StrategyHistory] upsert 실패:', e)
  }
}

/**
 * 직전 판정과 현재 지표 변화를 Gemini 프롬프트에 삽입할 컨텍스트 문자열 생성.
 * - 직전 분석이 7일 초과면 빈 문자열 반환 (너무 오래된 데이터 제외)
 * - RSI, MACD 히스토그램, 거래량, MA 크로스 변화를 한 줄씩 요약
 */
export function buildPreviousContext(
  previous: StrategyHistoryRecord,
  currentSnap: IndicatorSnapshot,
  isKR: boolean
): string {
  const daysDiff = Math.floor(
    (Date.now() - previous.generatedAt.getTime()) / (1000 * 60 * 60 * 24)
  )
  if (daysDiff > 7) return ''

  const fmtPrice = (v: number) =>
    isKR ? `${Math.round(v).toLocaleString('ko-KR')}원` : `$${v.toFixed(2)}`

  const priceChange = ((currentSnap.close - previous.price) / previous.price) * 100
  const prev = previous.snapshot
  const lines: string[] = []

  if (prev.rsi != null && currentSnap.rsi != null) {
    const delta = currentSnap.rsi - prev.rsi
    const note =
      currentSnap.rsi < 30 ? ' (과매도 진입 ⚠️)' :
      currentSnap.rsi > 70 ? ' (과매수 진입 ⚠️)' : ''
    lines.push(`- RSI: ${prev.rsi.toFixed(1)} → ${currentSnap.rsi.toFixed(1)} (${delta >= 0 ? '+' : ''}${delta.toFixed(1)}${note})`)
  }

  if (prev.histogram != null && currentSnap.histogram != null) {
    const prevSign = prev.histogram >= 0 ? '양' : '음'
    const curSign  = currentSnap.histogram >= 0 ? '양' : '음'
    const turned   = prevSign !== curSign ? ` (${curSign}전환)` : ''
    lines.push(`- MACD 히스토그램: ${prev.histogram.toFixed(2)} → ${currentSnap.histogram.toFixed(2)}${turned}`)
  }

  const volDelta = ((currentSnap.volumeRatio - prev.volumeRatio) / prev.volumeRatio) * 100
  lines.push(
    `- 거래량 비율: ${prev.volumeRatio.toFixed(1)}배 → ${currentSnap.volumeRatio.toFixed(1)}배 (${volDelta >= 0 ? '+' : ''}${volDelta.toFixed(0)}%)`
  )

  if (prev.maCrossState !== currentSnap.maCrossState) {
    const labels: Record<string, string> = {
      golden:  '골든크로스',
      dead:    '데드크로스',
      neutral: '중립',
    }
    lines.push(`- MA 크로스: ${labels[prev.maCrossState]} → ${labels[currentSnap.maCrossState]}`)
  }

  const stalenessNote =
    daysDiff >= 4
      ? `\n※ 주의: 이 데이터는 ${daysDiff}일 전 분석으로 다소 오래되었습니다. 현재 데이터를 우선하세요.`
      : ''

  return `
## 직전 분석 이후 변화 (${daysDiff}일 전)
직전 판정: ${previous.signal.toUpperCase()} (당시 ${fmtPrice(previous.price)}) → 현재 ${fmtPrice(currentSnap.close)} (${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(1)}%)

지표 변화:
${lines.join('\n')}

직전 요약: ${previous.summary}
※ 위 정보는 맥락 참고용입니다. 현재 데이터 기반으로 독립적으로 판단하되, 중대한 변화가 감지되면 직전 판정을 과감히 수정하세요.${stalenessNote}`
}
