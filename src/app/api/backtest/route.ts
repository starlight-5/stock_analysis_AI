import { NextRequest, NextResponse } from 'next/server'
import { fetchStockData } from '@/lib/dataSource'
import { calcIndicators, getSnapshot } from '@/lib/indicators'
import type { IndicatorSnapshot } from '@/types/stock'

const MIN_BARS = 35

// ── 복합 스코어 계산 (-10 ~ +10) ──────────────────────────────────
function calcScore(snap: IndicatorSnapshot, prev: IndicatorSnapshot | null): number {
  let score = 0
  const rsi   = snap.rsi   ?? 50
  const bbPos = snap.bbPosition ?? 0.5
  const hist  = snap.histogram ?? 0
  const prevHist = prev?.histogram ?? null

  // RSI (-2 ~ +2)
  if      (rsi < 30)              score += 2
  else if (rsi < 40)              score += 1
  else if (rsi >= 60 && rsi < 70) score -= 1
  else if (rsi >= 70)             score -= 2

  // 볼린저 위치 (-3 ~ +3)
  if      (bbPos < 0.1)              score += 3
  else if (bbPos < 0.2)              score += 2
  else if (bbPos < 0.4)              score += 1
  else if (bbPos >= 0.6 && bbPos < 0.8) score -= 1
  else if (bbPos >= 0.8 && bbPos < 0.9) score -= 2
  else if (bbPos >= 0.9)             score -= 3

  // MACD 히스토그램 (-2 ~ +2)
  if (prevHist !== null) {
    if   (prevHist <= 0 && hist > 0)             score += 2  // 음→양 전환
    else if (hist > 0  && hist > prevHist)        score += 1  // 양수 증가 중
    else if (prevHist >= 0 && hist < 0)           score -= 2  // 양→음 전환
    else if (hist < 0  && hist < prevHist)        score -= 1  // 음수 감소 중
  }

  // MA 5/20 크로스 (-1 ~ +1)
  if      (snap.maCrossState === 'golden') score += 1
  else if (snap.maCrossState === 'dead')   score -= 1

  // MA 20/60 크로스 (-2 ~ +2)
  const { ma20, ma60 } = snap
  const prevMa20 = prev?.ma20 ?? null
  const prevMa60 = prev?.ma60 ?? null
  if (ma20 !== null && ma60 !== null && prevMa20 !== null && prevMa60 !== null) {
    if (prevMa20 <= prevMa60 && ma20 > ma60)      score += 2
    else if (prevMa20 >= prevMa60 && ma20 < ma60) score -= 2
  }

  // 거래량 × 방향 (-1 ~ +1)
  const priceUp = prev ? snap.close > prev.close : false
  if      (priceUp  && snap.volumeRatio > 1.5) score += 1
  else if (!priceUp && snap.volumeRatio > 1.5) score -= 1

  return score
}

function scoreToSignal(score: number): 'strong_buy' | 'buy' | 'watch' | 'sell' | 'strong_sell' {
  if (score >= 4)  return 'strong_buy'
  if (score >= 2)  return 'buy'
  if (score > -2)  return 'watch'
  if (score >= -4) return 'sell'
  return 'strong_sell'
}

// ── Gemini 확인 호출 ──────────────────────────────────────────────
function buildPrompt(ticker: string, snap: IndicatorSnapshot): string {
  const fmt = (v: number | null, dec = 2) => v == null ? 'N/A' : v.toFixed(dec)
  const pct = (v: number | null) => v == null ? 'N/A' : `${(v * 100).toFixed(1)}%`
  const won = (v: number | null) => v == null ? 'N/A' : `${v.toLocaleString('ko-KR')}원`

  const bbPos = snap.bbPosition == null ? 'N/A'
    : snap.bbPosition < 0.2 ? `하단 근처 (${pct(snap.bbPosition)})`
    : snap.bbPosition > 0.8 ? `상단 근처 (${pct(snap.bbPosition)})`
    : `중간 (${pct(snap.bbPosition)})`

  const crossLabels: Record<string, string> = {
    golden: '골든크로스 (5일선 > 20일선)',
    dead:   '데드크로스 (5일선 < 20일선)',
    neutral: '중립',
  }

  return `
당신은 주식 기술적 분석 전문가입니다. 아래 지표를 종합 분석하여 매매 시그널만 판단하세요.

## 종목 정보
- 티커: ${ticker}
- 현재가: ${won(snap.close)}

## 기술적 지표 (최신값)
- RSI(14): ${fmt(snap.rsi, 1)} ${snap.rsi == null ? '' : snap.rsi < 30 ? '⚠️ 과매도' : snap.rsi > 70 ? '⚠️ 과매수' : ''}
- MACD: ${fmt(snap.macd)} / 시그널: ${fmt(snap.signal)} / 히스토그램: ${fmt(snap.histogram)}
- 볼린저 밴드: 상단 ${won(snap.bbUpper)} / 중심 ${won(snap.bbMid)} / 하단 ${won(snap.bbLower)}
- 밴드 내 위치: ${bbPos}
- 이동평균: MA5 ${won(snap.ma5)} / MA20 ${won(snap.ma20)} / MA60 ${won(snap.ma60)} / MA120 ${won(snap.ma120)}
- 이동평균 크로스: ${crossLabels[snap.maCrossState]}
- 거래량 비율 (최근5일/20일평균): ${fmt(snap.volumeRatio, 2)}배

## 출력 형식 (반드시 JSON으로만 응답)
{"signal": "strong_buy | buy | watch | sell | strong_sell 중 하나", "reason": "한 문장 이유"}
`
}

async function callGemini(
  ticker: string,
  snap: IndicatorSnapshot,
  apiKey: string,
): Promise<{ signal: string; reason: string } | null> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(ticker, snap) }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0, maxOutputTokens: 256 },
        }),
        signal: AbortSignal.timeout(12_000),
      },
    )
    if (!res.ok) return null
    const json  = await res.json()
    const raw   = json.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    const clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
    const parsed = JSON.parse(clean)
    return { signal: parsed.signal ?? 'watch', reason: parsed.reason ?? '' }
  } catch {
    return null
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// ── 통계 집계 헬퍼 ─────────────────────────────────────────────────
type FwdKey = 'fwd5' | 'fwd10' | 'fwd20'
type FwdVal = { returnPct: number; price: number } | null

function calcStats(points: { fwd5: FwdVal; fwd10: FwdVal; fwd20: FwdVal }[], field: FwdKey) {
  const valid = points.map(p => p[field]).filter((v): v is NonNullable<FwdVal> => v !== null)
  if (!valid.length) return { count: 0, avgReturn: 0, winRate: 0, maxGain: 0, maxLoss: 0 }
  const rets = valid.map(v => v.returnPct)
  return {
    count:     valid.length,
    avgReturn: Number((rets.reduce((a, b) => a + b, 0) / rets.length).toFixed(2)),
    winRate:   Number((rets.filter(r => r > 0).length / rets.length * 100).toFixed(1)),
    maxGain:   Number(Math.max(...rets).toFixed(2)),
    maxLoss:   Number(Math.min(...rets).toFixed(2)),
  }
}

// ── 메인 핸들러 ────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body   = await req.json()
    const ticker = (body.ticker as string)?.toUpperCase()
    if (!ticker) return NextResponse.json({ error: 'ticker 필드 필요' }, { status: 400 })

    const geminiApiKey = process.env.GEMINI_API_KEY ?? ''
    const { bars }     = await fetchStockData(ticker)

    if (bars.length < MIN_BARS) {
      return NextResponse.json({ error: `데이터 부족 (최소 ${MIN_BARS}일)` }, { status: 400 })
    }

    // ── 1. 워크포워드: 복합 스코어 계산 ─────────────────────────────
    type DayInfo = {
      index: number
      date: string
      close: number
      score: number
      signal: string
      snap: IndicatorSnapshot | null
    }

    const dayInfos: DayInfo[] = []
    let prevSnap: IndicatorSnapshot | null = null

    for (let i = 0; i < bars.length; i++) {
      if (i < MIN_BARS - 1) {
        dayInfos.push({ index: i, date: bars[i].date, close: bars[i].close, score: 0, signal: 'watch', snap: null })
        continue
      }
      const ind  = calcIndicators(bars.slice(0, i + 1))
      const snap = getSnapshot(bars.slice(0, i + 1), ind)
      const score = calcScore(snap, prevSnap)
      dayInfos.push({ index: i, date: bars[i].date, close: bars[i].close, score, signal: scoreToSignal(score), snap })
      prevSnap = snap
    }

    // ── 2. Buy 전환 시점만 추출 (연속 buy 중 첫날만) ──────────────
    const FORWARD_NEED = 20
    const candidates = dayInfos.filter((d, i) => {
      if (i === 0 || !d.snap) return false
      if (d.index + FORWARD_NEED >= bars.length) return false  // 미래 20일 필요
      const isBuy    = d.signal === 'buy' || d.signal === 'strong_buy'
      const wasntBuy = dayInfos[i - 1].signal !== 'buy' && dayInfos[i - 1].signal !== 'strong_buy'
      return isBuy && wasntBuy
    })

    // ── 3. 각 후보에 Gemini 확인 호출 ─────────────────────────────
    type SignalPoint = {
      date: string
      close: number
      score: number
      compSignal: string
      geminiSignal: string | null
      geminiReason: string | null
      geminiConfirmed: boolean
      fwd5: FwdVal
      fwd10: FwdVal
      fwd20: FwdVal
    }

    const getFwd = (idx: number, offset: number): FwdVal => {
      const fi = idx + offset
      if (fi >= bars.length) return null
      const futureClose = bars[fi].close
      return { price: futureClose, returnPct: Number(((futureClose - bars[idx].close) / bars[idx].close * 100).toFixed(2)) }
    }

    const signalPoints: SignalPoint[] = []

    for (const c of candidates) {
      let geminiSignal: string | null  = null
      let geminiReason: string | null  = null

      if (geminiApiKey) {
        const result = await callGemini(ticker, c.snap!, geminiApiKey)
        geminiSignal = result?.signal ?? null
        geminiReason = result?.reason ?? null
        await sleep(350)  // Gemini 무료티어 rate limit 방지
      }

      signalPoints.push({
        date:             c.date,
        close:            c.close,
        score:            c.score,
        compSignal:       c.signal,
        geminiSignal,
        geminiReason,
        geminiConfirmed:  geminiSignal === 'buy' || geminiSignal === 'strong_buy',
        fwd5:             getFwd(c.index, 5),
        fwd10:            getFwd(c.index, 10),
        fwd20:            getFwd(c.index, 20),
      })
    }

    // ── 4. 랜덤 진입 베이스라인 (동일 개수, 균등 간격) ────────────
    const randomCount  = Math.max(candidates.length, 5)
    const step         = Math.floor((bars.length - MIN_BARS - FORWARD_NEED) / randomCount)
    const randomPoints = Array.from({ length: randomCount }, (_, k) => {
      const idx = MIN_BARS + k * Math.max(step, 1)
      if (idx + FORWARD_NEED >= bars.length) return null
      return { fwd5: getFwd(idx, 5), fwd10: getFwd(idx, 10), fwd20: getFwd(idx, 20) }
    }).filter((p): p is NonNullable<typeof p> => p !== null)

    // ── 5. 통계 집계 ──────────────────────────────────────────────
    const confirmedPoints = signalPoints.filter(p => p.geminiConfirmed)

    return NextResponse.json({
      ticker,
      period: { start: bars[0].date, end: bars[bars.length - 1].date, tradingDays: bars.length },
      hasGemini:          !!geminiApiKey,
      candidateCount:     candidates.length,
      confirmedCount:     confirmedPoints.length,
      confirmationRate:   candidates.length > 0
        ? Number((confirmedPoints.length / candidates.length * 100).toFixed(1))
        : 0,
      stats: {
        composite: {
          fwd5:  calcStats(signalPoints, 'fwd5'),
          fwd10: calcStats(signalPoints, 'fwd10'),
          fwd20: calcStats(signalPoints, 'fwd20'),
        },
        geminiConfirmed: {
          fwd5:  calcStats(confirmedPoints, 'fwd5'),
          fwd10: calcStats(confirmedPoints, 'fwd10'),
          fwd20: calcStats(confirmedPoints, 'fwd20'),
        },
        random: {
          fwd5:  calcStats(randomPoints, 'fwd5'),
          fwd10: calcStats(randomPoints, 'fwd10'),
          fwd20: calcStats(randomPoints, 'fwd20'),
        },
      },
      signalPoints,
    })
  } catch (e: any) {
    console.error('[backtest]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
