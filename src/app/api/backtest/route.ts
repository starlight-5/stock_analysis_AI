import { NextRequest, NextResponse } from 'next/server'
import { fetchStockData } from '@/lib/dataSource'
import { calcIndicators, getSnapshot } from '@/lib/indicators'
import type { OHLCVBar, IndicatorSnapshot } from '@/types/stock'

const MIN_BARS      = 35
const MAX_HOLD      = 30    // 최대 보유 거래일 (이후 강제 청산)
const SLIPPAGE_RATE = 0.002 // 슬리피지 + 수수료 합산 (편도 0.2%)

// ── 시장 상태(Market Regime) 감지 ──────────────────────────────────
// MA60 > MA120 → 추세 시장, 그 외 → 횡보/하락 시장
type Regime = 'trending' | 'ranging'

function detectRegime(snap: IndicatorSnapshot): Regime {
  if (snap.ma60 !== null && snap.ma120 !== null && snap.ma60 > snap.ma120) {
    return 'trending'
  }
  return 'ranging'
}

// ── 복합 스코어 계산 (Regime 적응형) ──────────────────────────────
// 추세 시장: MACD·MA 가중치 ↑, RSI·BB 가중치 ↓ (추세 추종)
// 횡보·하락 시장: RSI·BB 가중치 ↑ (평균회귀)
function calcScore(snap: IndicatorSnapshot, prev: IndicatorSnapshot | null): number {
  const regime = detectRegime(snap)
  let score = 0
  const rsi   = snap.rsi        ?? 50
  const bbPos = snap.bbPosition ?? 0.5
  const hist  = snap.histogram  ?? 0
  const prevH = prev?.histogram ?? null

  if (regime === 'trending') {
    // RSI (-2 ~ +2)
    if      (rsi < 30)              score += 2
    else if (rsi < 45)              score += 1
    else if (rsi >= 55 && rsi < 70) score -= 1
    else if (rsi >= 70)             score -= 2

    // 볼린저 밴드 위치 (-1 ~ +1)
    if      (bbPos < 0.15)  score += 1
    else if (bbPos >= 0.85) score -= 1

    // MACD 히스토그램 (-2 ~ +2)
    if (prevH !== null) {
      if      (prevH <= 0 && hist > 0)   score += 2
      else if (hist > 0 && hist > prevH) score += 1
      else if (prevH >= 0 && hist < 0)   score -= 2
      else if (hist < 0 && hist < prevH) score -= 1
    }

    // MA 5/20 크로스 (-2 ~ +2)
    if      (snap.maCrossState === 'golden') score += 2
    else if (snap.maCrossState === 'dead')   score -= 2

    // MA 20/60 크로스 (-2 ~ +2)
    const { ma20: m20t, ma60: m60t } = snap
    const pm20t = prev?.ma20 ?? null, pm60t = prev?.ma60 ?? null
    if (m20t !== null && m60t !== null && pm20t !== null && pm60t !== null) {
      if      (pm20t <= pm60t && m20t > m60t) score += 2
      else if (pm20t >= pm60t && m20t < m60t) score -= 2
    }
  } else {
    // 횡보·하락 시장: RSI·BB 평균회귀 중심
    // RSI (-3 ~ +3)
    if      (rsi < 30)              score += 3
    else if (rsi < 45)              score += 2
    else if (rsi >= 55 && rsi < 70) score -= 2
    else if (rsi >= 70)             score -= 3

    // 볼린저 밴드 위치 (-3 ~ +3)
    if      (bbPos < 0.15)                   score += 3
    else if (bbPos < 0.35)                   score += 2
    else if (bbPos < 0.5)                    score += 1
    else if (bbPos >= 0.65 && bbPos < 0.85)  score -= 2
    else if (bbPos >= 0.85)                  score -= 3

    // MACD 히스토그램 (-1 ~ +1)
    if (prevH !== null) {
      if      (prevH <= 0 && hist > 0)   score += 1
      else if (hist > 0 && hist > prevH) score += 1
      else if (prevH >= 0 && hist < 0)   score -= 1
      else if (hist < 0 && hist < prevH) score -= 1
    }

    // MA 5/20 크로스 (-1 ~ +1)
    if      (snap.maCrossState === 'golden') score += 1
    else if (snap.maCrossState === 'dead')   score -= 1

    // MA 20/60 크로스 전환 시점 (-1 ~ +1)
    const { ma20: m20r, ma60: m60r } = snap
    const pm20r = prev?.ma20 ?? null, pm60r = prev?.ma60 ?? null
    if (m20r !== null && m60r !== null && pm20r !== null && pm60r !== null) {
      if      (pm20r <= pm60r && m20r > m60r) score += 1
      else if (pm20r >= pm60r && m20r < m60r) score -= 1
    }
  }

  // 거래량 × 방향 (공통, -1 ~ +1)
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

// ── MDD (최대 낙폭, %) ─────────────────────────────────────────────
function calcMDD(returns: number[]): number {
  let peak = 0, mdd = 0, cum = 0
  for (const r of returns) {
    cum += r
    if (cum > peak) peak = cum
    const dd = peak - cum
    if (dd > mdd) mdd = dd
  }
  return Number(mdd.toFixed(2))
}

// ── Sharpe Ratio (per-trade 수익률 기반 정보 비율) ──────────────────
function calcSharpe(returns: number[]): number {
  if (returns.length < 2) return 0
  const mean     = returns.reduce((a, b) => a + b, 0) / returns.length
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length
  const sd       = Math.sqrt(variance)
  return sd === 0 ? 0 : Number((mean / sd).toFixed(2))
}

// ── Gemini 전략 호출 ──────────────────────────────────────────────
function buildPrompt(ticker: string, snap: IndicatorSnapshot): string {
  const fmt = (v: number | null, d = 2) => v == null ? 'N/A' : v.toFixed(d)
  const won = (v: number | null)        => v == null ? 'N/A' : `${v.toLocaleString('ko-KR')}원`
  const pct = (v: number | null)        => v == null ? 'N/A' : `${(v * 100).toFixed(1)}%`

  const bbPos = snap.bbPosition == null ? 'N/A'
    : snap.bbPosition < 0.2 ? `하단 근처 (${pct(snap.bbPosition)})`
    : snap.bbPosition > 0.8 ? `상단 근처 (${pct(snap.bbPosition)})`
    : `중간 (${pct(snap.bbPosition)})`

  const cross: Record<string, string> = {
    golden:  '골든크로스 (5일선 > 20일선)',
    dead:    '데드크로스 (5일선 < 20일선)',
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
  signal:  string
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

// ── 전략 시뮬레이션 (슬리피지 반영) ───────────────────────────────
function simulateTrade(strategy: GeminiStrategy, signalIdx: number, bars: OHLCVBar[]) {
  if (strategy.signal !== 'buy' && strategy.signal !== 'strong_buy') {
    return { skipped: true, skipReason: `Gemini 비동의 (${strategy.signal})` }
  }
  if (!strategy.entries.length || !strategy.targets.length || strategy.stopLoss <= 0) {
    return { skipped: true, skipReason: '전략 데이터 불완전' }
  }

  const UNIT_CAPITAL = 1_000_000
  const entryHit  = strategy.entries.map(() => false)
  const targetHit = strategy.targets.map(() => false)

  let shares          = 0
  let investedCost    = 0
  let realizedPnL     = 0
  let firstEntryDate: string | null = null
  let closeDate: string | null      = null
  let closeReason: string           = 'timeout'
  let stopped         = false

  const endIdx = Math.min(signalIdx + MAX_HOLD, bars.length - 1)

  for (let i = signalIdx + 1; i <= endIdx; i++) {
    const { low, high, date } = bars[i]

    // 진입 체결 (슬리피지 적용: 실제 체결가 = ep * (1 + rate))
    for (let j = 0; j < strategy.entries.length; j++) {
      if (entryHit[j]) continue
      const { price: ep, ratio } = strategy.entries[j]
      if (low <= ep && ep <= high) {
        const capital        = UNIT_CAPITAL * (ratio / 100)
        const effectiveEntry = ep * (1 + SLIPPAGE_RATE)
        shares              += capital / effectiveEntry
        investedCost        += capital
        entryHit[j]          = true
        if (!firstEntryDate) firstEntryDate = date
      }
    }

    if (shares === 0) continue

    // 손절 체크 (슬리피지 적용: 실제 체결가 = stopLoss * (1 - rate))
    if (low <= strategy.stopLoss) {
      realizedPnL += shares * (strategy.stopLoss * (1 - SLIPPAGE_RATE)) - investedCost
      closeDate    = date
      closeReason  = 'stop_loss'
      stopped      = true
      break
    }

    // 목표가 체크 (슬리피지 적용: 실제 체결가 = tp * (1 - rate))
    for (let j = 0; j < strategy.targets.length; j++) {
      if (targetHit[j]) continue
      const { price: tp, ratio } = strategy.targets[j]
      if (high >= tp) {
        const sellShares  = shares * (ratio / 100)
        const costPart    = investedCost * (ratio / 100)
        realizedPnL      += sellShares * (tp * (1 - SLIPPAGE_RATE)) - costPart
        shares           -= sellShares
        investedCost     -= costPart
        targetHit[j]      = true
      }
    }

    if (targetHit.every(h => h)) {
      closeDate   = date
      closeReason = 'all_targets'
      break
    }
  }

  // 기간 만료: 잔여 포지션 슬리피지 적용 강제 청산
  if (!stopped && shares > 0) {
    realizedPnL += shares * (bars[endIdx].close * (1 - SLIPPAGE_RATE)) - investedCost
    closeDate    = bars[endIdx].date
    closeReason  = targetHit.some(h => h) ? 'partial_target' : 'timeout'
  }

  const entryCount  = entryHit.filter(Boolean).length
  const targetCount = targetHit.filter(Boolean).length
  const returnPct   = entryCount > 0
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

    const isKR         = /^\d{6}$/.test(ticker)
    const geminiApiKey = process.env.GEMINI_API_KEY ?? ''
    // 미국 주식은 최대 500거래일(~2년), 한국 주식은 KIS API 제한으로 120일 유지
    const { bars } = await fetchStockData(ticker, isKR ? 120 : 500)
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
      regime: Regime
      snap:   IndicatorSnapshot | null
    }

    const days: DayInfo[] = []
    let prevSnap: IndicatorSnapshot | null = null

    for (let i = 0; i < bars.length; i++) {
      if (i < MIN_BARS - 1) {
        days.push({ index: i, date: bars[i].date, close: bars[i].close, score: 0, signal: 'watch', regime: 'ranging', snap: null })
        continue
      }
      const ind    = calcIndicators(bars.slice(0, i + 1))
      const snap   = getSnapshot(bars.slice(0, i + 1), ind)
      const score  = calcScore(snap, prevSnap)
      const regime = detectRegime(snap)
      days.push({ index: i, date: bars[i].date, close: bars[i].close, score, signal: scoreToSignal(score), regime, snap })
      prevSnap = snap
    }

    // ── 2. Buy 전환 시점 추출 ─────────────────────────────────────
    const candidates = days.filter((d, i) => {
      if (i === 0 || !d.snap)                      return false
      if (d.index + MAX_HOLD >= bars.length)        return false
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
      regime:         Regime
      geminiSignal:   string | null
      geminiSummary:  string
      entries:        { price: number; ratio: number; reason: string }[]
      stopLoss:       number
      targets:        { price: number; ratio: number; reason: string }[]
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
          compScore: c.score, compSignal: c.signal, regime: c.regime,
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
        regime:        c.regime,
        geminiSignal:  strategy.signal,
        geminiSummary: strategy.summary,
        entries:       strategy.entries,
        stopLoss:      strategy.stopLoss,
        targets:       strategy.targets,
        ...(sim as any),
      })
    }

    // ── 4. 집계 + MDD / Sharpe ────────────────────────────────────
    const executed = trades.filter(t => !t.skipped && t.returnPct !== null)
    const wins     = executed.filter(t => (t.returnPct ?? 0) > 0)
    const losses   = executed.filter(t => (t.returnPct ?? 0) <= 0)
    const stopped  = executed.filter(t => t.closeReason === 'stop_loss')
    const targeted = executed.filter(t => t.closeReason === 'all_targets' || t.closeReason === 'partial_target')

    const avg          = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
    const returnValues = executed.map(t => t.returnPct!)

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
      avgReturn:       Number(avg(returnValues).toFixed(2)),
      avgWin:          Number(avg(wins.map(t => t.returnPct!)).toFixed(2)),
      avgLoss:         Number(avg(losses.map(t => t.returnPct!)).toFixed(2)),
      totalReturn:     Number(returnValues.reduce((a, b) => a + b, 0).toFixed(2)),
      mdd:             calcMDD(returnValues),
      sharpe:          calcSharpe(returnValues),
      slippageRate:    SLIPPAGE_RATE,
    }

    return NextResponse.json({
      ticker,
      period:      { start: bars[0].date, end: bars[bars.length - 1].date, tradingDays: bars.length },
      hasGemini:   !!geminiApiKey,
      maxHoldDays: MAX_HOLD,
      summary,
      trades,
    })
  } catch (e: any) {
    console.error('[backtest]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
