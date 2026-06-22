import { NextRequest, NextResponse } from 'next/server'
import { fetchStockData } from '@/lib/dataSource'
import { calcIndicators, getSnapshot } from '@/lib/indicators'
import type { OHLCVBar, IndicatorSnapshot } from '@/types/stock'

const MIN_BARS    = 35
const MAX_HOLD    = 30  // 최대 보유 거래일 (이후 강제 청산)

// ── 복합 스코어 계산 (-10 ~ +10) ──────────────────────────────────
function calcScore(snap: IndicatorSnapshot, prev: IndicatorSnapshot | null): number {
  let score = 0
  const rsi    = snap.rsi   ?? 50
  const bbPos  = snap.bbPosition ?? 0.5
  const hist   = snap.histogram ?? 0
  const prevH  = prev?.histogram ?? null

  // RSI
  if      (rsi < 30)              score += 2
  else if (rsi < 40)              score += 1
  else if (rsi >= 60 && rsi < 70) score -= 1
  else if (rsi >= 70)             score -= 2

  // 볼린저 위치
  if      (bbPos < 0.1)                  score += 3
  else if (bbPos < 0.2)                  score += 2
  else if (bbPos < 0.4)                  score += 1
  else if (bbPos >= 0.6 && bbPos < 0.8)  score -= 1
  else if (bbPos >= 0.8 && bbPos < 0.9)  score -= 2
  else if (bbPos >= 0.9)                 score -= 3

  // MACD 히스토그램
  if (prevH !== null) {
    if   (prevH <= 0 && hist > 0)           score += 2
    else if (hist > 0 && hist > prevH)       score += 1
    else if (prevH >= 0 && hist < 0)         score -= 2
    else if (hist < 0 && hist < prevH)       score -= 1
  }

  // MA 5/20 크로스
  if      (snap.maCrossState === 'golden') score += 1
  else if (snap.maCrossState === 'dead')   score -= 1

  // MA 20/60 크로스
  const { ma20, ma60 } = snap
  const pm20 = prev?.ma20 ?? null, pm60 = prev?.ma60 ?? null
  if (ma20 !== null && ma60 !== null && pm20 !== null && pm60 !== null) {
    if      (pm20 <= pm60 && ma20 > ma60) score += 2
    else if (pm20 >= pm60 && ma20 < ma60) score -= 2
  }

  // 거래량 × 방향
  const up = prev ? snap.close > prev.close : false
  if      (up  && snap.volumeRatio > 1.5) score += 1
  else if (!up && snap.volumeRatio > 1.5) score -= 1

  return score
}

function scoreToSignal(s: number): string {
  if (s >= 4)  return 'strong_buy'
  if (s >= 2)  return 'buy'
  if (s > -2)  return 'watch'
  if (s >= -4) return 'sell'
  return 'strong_sell'
}

// ── Gemini 전략 호출 (기존 strategy 라우트와 동일 프롬프트) ──────────
function buildPrompt(ticker: string, snap: IndicatorSnapshot): string {
  const fmt = (v: number | null, d = 2) => v == null ? 'N/A' : v.toFixed(d)
  const won = (v: number | null)        => v == null ? 'N/A' : `${v.toLocaleString('ko-KR')}원`
  const pct = (v: number | null)        => v == null ? 'N/A' : `${(v * 100).toFixed(1)}%`

  const bbPos = snap.bbPosition == null ? 'N/A'
    : snap.bbPosition < 0.2 ? `하단 근처 (${pct(snap.bbPosition)})`
    : snap.bbPosition > 0.8 ? `상단 근처 (${pct(snap.bbPosition)})`
    : `중간 (${pct(snap.bbPosition)})`

  const cross: Record<string, string> = {
    golden: '골든크로스 (5일선 > 20일선)',
    dead:   '데드크로스 (5일선 < 20일선)',
    neutral: '중립',
  }

  return `
당신은 주식 기술적 분석 전문가입니다. 아래 지표를 종합 분석하여 매매 전략을 수립하세요.

## 종목 정보
- 티커: ${ticker}
- 현재가: ${won(snap.close)}

## 기술적 지표 (최신값)
- RSI(14): ${fmt(snap.rsi, 1)} ${snap.rsi == null ? '' : snap.rsi < 30 ? '⚠️ 과매도' : snap.rsi > 70 ? '⚠️ 과매수' : ''}
- MACD: ${fmt(snap.macd)} / 시그널: ${fmt(snap.signal)} / 히스토그램: ${fmt(snap.histogram)}
- 볼린저 밴드: 상단 ${won(snap.bbUpper)} / 중심 ${won(snap.bbMid)} / 하단 ${won(snap.bbLower)}
- 밴드 내 위치: ${bbPos}
- 이동평균: MA5 ${won(snap.ma5)} / MA20 ${won(snap.ma20)} / MA60 ${won(snap.ma60)} / MA120 ${won(snap.ma120)}
- 이동평균 크로스: ${cross[snap.maCrossState]}
- 거래량 비율 (최근5일/20일평균): ${fmt(snap.volumeRatio, 2)}배

## 출력 형식 (반드시 JSON으로만 응답)
{
  "signal": "strong_buy | buy | watch | sell | strong_sell 중 하나",
  "summary": "현재 상황 2문장 요약",
  "buyStrategy": {
    "type": "lump 또는 split",
    "entries": [{ "price": 정수, "ratio": 비중퍼센트, "reason": "이유" }],
    "stopLoss": 정수,
    "stopLossReason": "손절 이유"
  },
  "sellStrategy": {
    "targets": [{ "price": 정수, "ratio": 비중퍼센트, "reason": "이유" }]
  },
  "risks": ["리스크1", "리스크2", "리스크3"]
}

규칙: 모든 가격은 정수. entries 비중 합계 = 100. targets 비중 합계 = 100.
split 조건: RSI<40 또는 하락추세 → 2~3회 분할. lump 조건: 강한 모멘텀.
`
}

interface GeminiStrategy {
  signal: string
  entries: { price: number; ratio: number; reason: string }[]
  stopLoss: number
  targets:  { price: number; ratio: number; reason: string }[]
  summary:  string
}

async function callGemini(
  ticker: string,
  snap: IndicatorSnapshot,
  apiKey: string,
): Promise<GeminiStrategy | null> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(ticker, snap) }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0, maxOutputTokens: 1024 },
        }),
        signal: AbortSignal.timeout(15_000),
      },
    )
    if (!res.ok) return null
    const json  = await res.json()
    const raw   = json.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    const clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
    const p     = JSON.parse(clean)
    return {
      signal:   p.signal ?? 'watch',
      entries:  (p.buyStrategy?.entries ?? []).sort((a: any, b: any) => b.price - a.price),
      stopLoss: p.buyStrategy?.stopLoss ?? 0,
      targets:  (p.sellStrategy?.targets ?? []).sort((a: any, b: any) => a.price - b.price),
      summary:  p.summary ?? '',
    }
  } catch {
    return null
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// ── 전략 시뮬레이션: Gemini 가격 그대로 따라가기 ──────────────────
function simulateTrade(
  strategy: GeminiStrategy,
  signalIdx: number,
  bars: OHLCVBar[],
) {
  // 정상 신호 아니면 skip
  if (strategy.signal !== 'buy' && strategy.signal !== 'strong_buy') {
    return { skipped: true, skipReason: `Gemini 비동의 (${strategy.signal})` }
  }
  if (!strategy.entries.length || !strategy.targets.length || strategy.stopLoss <= 0) {
    return { skipped: true, skipReason: '전략 데이터 불완전' }
  }

  const UNIT_CAPITAL = 1_000_000  // 비중 계산용 기준 자본 (실제 비율만 사용)
  const entryHit  = strategy.entries.map(() => false)
  const targetHit = strategy.targets.map(() => false)

  let shares          = 0       // 총 보유 주수
  let investedCost    = 0       // 총 투자 원가
  let realizedPnL     = 0       // 실현 손익
  let firstEntryDate: string | null = null
  let closeDate: string | null  = null
  let closeReason: string       = 'timeout'
  let stopped         = false

  const endIdx = Math.min(signalIdx + MAX_HOLD, bars.length - 1)

  for (let i = signalIdx + 1; i <= endIdx; i++) {
    const { low, high, date } = bars[i]

    // ─ 아직 진입 안 된 entry 가격 체크 (low ≤ entry ≤ high)
    for (let j = 0; j < strategy.entries.length; j++) {
      if (entryHit[j]) continue
      const { price: ep, ratio } = strategy.entries[j]
      if (low <= ep && ep <= high) {
        const capital = UNIT_CAPITAL * (ratio / 100)
        const bought  = capital / ep
        shares       += bought
        investedCost += capital
        entryHit[j]  = true
        if (!firstEntryDate) firstEntryDate = date
      }
    }

    if (shares === 0) continue  // 아직 진입 전

    // ─ 손절 체크 (당일 저가가 손절선 이하)
    if (low <= strategy.stopLoss) {
      realizedPnL += shares * strategy.stopLoss - investedCost
      closeDate    = date
      closeReason  = 'stop_loss'
      stopped      = true
      break
    }

    // ─ 목표가 체크 (당일 고가가 목표가 이상)
    for (let j = 0; j < strategy.targets.length; j++) {
      if (targetHit[j]) continue
      const { price: tp, ratio } = strategy.targets[j]
      if (high >= tp) {
        const sellShares = shares * (ratio / 100)
        const costPart   = investedCost * (ratio / 100)
        realizedPnL     += sellShares * tp - costPart
        shares          -= sellShares
        investedCost    -= costPart
        targetHit[j]    = true
      }
    }

    // ─ 전체 목표 달성
    if (targetHit.every(h => h)) {
      closeDate   = date
      closeReason = 'all_targets'
      break
    }
  }

  // ─ 기간 만료: 남은 포지션 강제 청산
  if (!stopped && shares > 0) {
    const lastClose  = bars[endIdx].close
    realizedPnL     += shares * lastClose - investedCost
    closeDate        = bars[endIdx].date
    closeReason      = targetHit.some(h => h) ? 'partial_target' : 'timeout'
  }

  const entryCount    = entryHit.filter(Boolean).length
  const targetCount   = targetHit.filter(Boolean).length
  const returnPct     = entryCount > 0
    ? Number((realizedPnL / UNIT_CAPITAL * 100).toFixed(2))
    : null

  return {
    skipped:        false,
    firstEntryDate,
    closeDate,
    closeReason,
    entriesHit:     entryCount,
    totalEntries:   strategy.entries.length,
    targetsHit:     targetCount,
    totalTargets:   strategy.targets.length,
    returnPct,
    profitLoss:     Number(realizedPnL.toFixed(0)),
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

    // ── 1. 워크포워드 복합 스코어 ────────────────────────────────
    type DayInfo = {
      index:  number
      date:   string
      close:  number
      score:  number
      signal: string
      snap:   IndicatorSnapshot | null
    }

    const days: DayInfo[] = []
    let prevSnap: IndicatorSnapshot | null = null

    for (let i = 0; i < bars.length; i++) {
      if (i < MIN_BARS - 1) {
        days.push({ index: i, date: bars[i].date, close: bars[i].close, score: 0, signal: 'watch', snap: null })
        continue
      }
      const ind   = calcIndicators(bars.slice(0, i + 1))
      const snap  = getSnapshot(bars.slice(0, i + 1), ind)
      const score = calcScore(snap, prevSnap)
      days.push({ index: i, date: bars[i].date, close: bars[i].close, score, signal: scoreToSignal(score), snap })
      prevSnap = snap
    }

    // ── 2. Buy 전환 시점 추출 ─────────────────────────────────────
    const candidates = days.filter((d, i) => {
      if (i === 0 || !d.snap)                            return false
      if (d.index + MAX_HOLD >= bars.length)             return false
      const isBuy    = d.signal === 'buy' || d.signal === 'strong_buy'
      const wasntBuy = days[i - 1].signal !== 'buy' && days[i - 1].signal !== 'strong_buy'
      return isBuy && wasntBuy
    })

    // ── 3. Gemini 호출 + 전략 시뮬레이션 ─────────────────────────
    type TradeRecord = {
      signalDate:     string
      signalClose:    number
      compScore:      number
      compSignal:     string
      geminiSignal:   string | null
      geminiSummary:  string
      entries:        { price: number; ratio: number; reason: string }[]
      stopLoss:       number
      targets:        { price: number; ratio: number; reason: string }[]
      // 시뮬레이션 결과
      skipped:        boolean
      skipReason?:    string
      firstEntryDate: string | null
      closeDate:      string | null
      closeReason:    string | null
      entriesHit:     number
      totalEntries:   number
      targetsHit:     number
      totalTargets:   number
      returnPct:      number | null
    }

    const trades: TradeRecord[] = []

    for (const c of candidates) {
      let strategy: GeminiStrategy | null = null

      if (geminiApiKey) {
        strategy = await callGemini(ticker, c.snap!, geminiApiKey)
        await sleep(350)
      }

      if (!strategy) {
        trades.push({
          signalDate: c.date, signalClose: c.close,
          compScore: c.score, compSignal: c.signal,
          geminiSignal: null, geminiSummary: '',
          entries: [], stopLoss: 0, targets: [],
          skipped: true, skipReason: 'Gemini 호출 실패',
          firstEntryDate: null, closeDate: null, closeReason: null,
          entriesHit: 0, totalEntries: 0, targetsHit: 0, totalTargets: 0,
          returnPct: null,
        })
        continue
      }

      const sim = simulateTrade(strategy, c.index, bars)

      trades.push({
        signalDate:    c.date,
        signalClose:   c.close,
        compScore:     c.score,
        compSignal:    c.signal,
        geminiSignal:  strategy.signal,
        geminiSummary: strategy.summary,
        entries:       strategy.entries,
        stopLoss:      strategy.stopLoss,
        targets:       strategy.targets,
        ...(sim as any),
      })
    }

    // ── 4. 집계 ───────────────────────────────────────────────────
    const executed = trades.filter(t => !t.skipped && t.returnPct !== null)
    const wins     = executed.filter(t => (t.returnPct ?? 0) > 0)
    const losses   = executed.filter(t => (t.returnPct ?? 0) <= 0)
    const stopped  = executed.filter(t => t.closeReason === 'stop_loss')
    const targeted = executed.filter(t => t.closeReason === 'all_targets' || t.closeReason === 'partial_target')

    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0

    const summary = {
      totalSignals:    candidates.length,
      geminiConfirmed: trades.filter(t => t.geminiSignal === 'buy' || t.geminiSignal === 'strong_buy').length,
      executed:        executed.length,
      skipped:         trades.filter(t => t.skipped).length,
      wins:            wins.length,
      losses:          losses.length,
      stopLossHits:    stopped.length,
      allTargetHits:   targeted.length,
      winRate:         executed.length ? Number((wins.length / executed.length * 100).toFixed(1)) : 0,
      avgReturn:       Number(avg(executed.map(t => t.returnPct!)).toFixed(2)),
      avgWin:          Number(avg(wins.map(t => t.returnPct!)).toFixed(2)),
      avgLoss:         Number(avg(losses.map(t => t.returnPct!)).toFixed(2)),
      totalReturn:     Number(executed.reduce((a, t) => a + (t.returnPct ?? 0), 0).toFixed(2)),
    }

    return NextResponse.json({
      ticker,
      period:  { start: bars[0].date, end: bars[bars.length - 1].date, tradingDays: bars.length },
      hasGemini: !!geminiApiKey,
      maxHoldDays: MAX_HOLD,
      summary,
      trades,
    })
  } catch (e: any) {
    console.error('[backtest]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
