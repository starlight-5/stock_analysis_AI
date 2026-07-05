/**
 * 기술적 지표 계산 모듈
 *
 * 제공하는 지표:
 *   - SMA (단순 이동평균) / EMA (지수 이동평균)
 *   - RSI (Wilder's Smoothed RSI)
 *   - MACD (MACD Line, Signal Line, Histogram)
 *   - Bollinger Bands (Upper, Mid, Lower 및 BB Position, BB Width Ratio)
 *   - Volume Ratio (최근 5일 평균 거래량 / 20일 평균 거래량 비율)
 *   - Historical Volatility (역사적 변동성 HV20, HV60)
 *
 * 수치 계산 후 최종적으로 AI 및 UI 렌더링에 적합한 IndicatorSnapshot 형태로 가공한다.
 */
import type { OHLCVBar, Indicators, IndicatorSnapshot } from '@/types/stock'

// ─── 내부 헬퍼 ──────────────────────────────────────────────────

/** 단순 이동평균 (앞부분은 null 패딩) */
function sma(values: number[], period: number): (number | null)[] {
  return values.map((_, i) => {
    if (i < period - 1) return null
    const slice = values.slice(i - period + 1, i + 1)
    return slice.reduce((a, b) => a + b, 0) / period
  })
}

/** 지수 이동평균 */
function ema(values: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1)
  const result: (number | null)[] = Array(period - 1).fill(null)

  // 첫 번째 EMA는 SMA로 시드
  const seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period
  result.push(seed)

  for (let i = period; i < values.length; i++) {
    result.push(values[i] * k + (result[result.length - 1] as number) * (1 - k))
  }
  return result
}

/** 표준편차 */
function stddev(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

// ─── RSI ────────────────────────────────────────────────────────
/**
 * Wilder의 Smoothed RSI (업계 표준)
 * period = 14
 */
export function calcRSI(closes: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = Array(period).fill(null)

  // 첫 period개 변화량으로 초기 평균 이득/손실 계산
  let avgGain = 0
  let avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1]
    if (diff > 0) avgGain += diff
    else avgLoss += Math.abs(diff)
  }
  avgGain /= period
  avgLoss /= period

  const firstRS = avgLoss === 0 ? 100 : avgGain / avgLoss
  result.push(100 - 100 / (1 + firstRS))

  // Wilder 스무딩 (이후 값들)
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1]
    const gain = diff > 0 ? diff : 0
    const loss = diff < 0 ? Math.abs(diff) : 0

    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period

    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
    result.push(100 - 100 / (1 + rs))
  }

  return result
}

// ─── MACD ───────────────────────────────────────────────────────
/**
 * 표준 MACD (12, 26, 9)
 * null 패딩: ema26 시작 전 = null, 시그널 시작 전 = null
 */
export function calcMACD(
  closes: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): Indicators['macd'] {
  const ema12 = ema(closes, fastPeriod)
  const ema26 = ema(closes, slowPeriod)

  const macdLine: (number | null)[] = ema12.map((f, i) => {
    const s = ema26[i]
    return f !== null && s !== null ? f - s : null
  })

  // 시그널선: MACD 값이 존재하는 구간만 EMA 적용
  const macdValues = macdLine.filter((v): v is number => v !== null)
  const signalValues = ema(macdValues, signalPeriod)

  // null offset 계산: macdLine에서 처음 null이 아닌 인덱스
  const macdStart = macdLine.findIndex((v) => v !== null)
  // 시그널도 자체 null 패딩 있음 (signalPeriod - 1개)
  const signalStart = macdStart + signalPeriod - 1

  const signalLine: (number | null)[] = Array(signalStart).fill(null)
  for (let i = 0; i < signalValues.length; i++) {
    signalLine.push(signalValues[i])
  }

  const histogram: (number | null)[] = macdLine.map((m, i) => {
    const s = signalLine[i]
    return m !== null && s !== null ? m - s : null
  })

  return { macdLine, signalLine, histogram }
}

// ─── 볼린저 밴드 ─────────────────────────────────────────────────
/**
 * period=20, multiplier=2.0 (표준)
 */
export function calcBollinger(
  closes: number[],
  period = 20,
  multiplier = 2
): Indicators['bollinger'] {
  const mid = sma(closes, period)

  const upper: (number | null)[] = []
  const lower: (number | null)[] = []

  closes.forEach((_, i) => {
    if (i < period - 1) {
      upper.push(null)
      lower.push(null)
      return
    }
    const slice = closes.slice(i - period + 1, i + 1)
    const sd = stddev(slice)
    const m = mid[i] as number
    upper.push(m + multiplier * sd)
    lower.push(m - multiplier * sd)
  })

  return { upper, mid, lower }
}

// ─── 이동평균선 ──────────────────────────────────────────────────
export function calcMA(closes: number[]): Indicators['ma'] {
  return {
    ma5:   sma(closes, 5),
    ma20:  sma(closes, 20),
    ma60:  sma(closes, 60),
    ma120: sma(closes, 120),
  }
}

// ─── ATR (Average True Range, Wilder 14) ────────────────────────
export function calcATR(bars: OHLCVBar[], period = 14): (number | null)[] {
  if (bars.length <= period) return Array(bars.length).fill(null)
  const trs: number[] = []
  for (let i = 1; i < bars.length; i++) {
    const h = bars[i].high, l = bars[i].low, pc = bars[i - 1].close
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)))
  }
  // Wilder: 첫 ATR = 단순 평균, 이후 (prevATR*(p-1)+TR)/p
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period
  const result: (number | null)[] = [...Array(period).fill(null), atr]
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period
    result.push(atr)
  }
  return result
}

// ─── ADX (Average Directional Index, Wilder 14) ─────────────────
export function calcADX(bars: OHLCVBar[], period = 14): Indicators['adx'] {
  const n = bars.length
  const nullArr = (): (number | null)[] => Array(n).fill(null)
  if (n < period * 2) return { adx: nullArr(), plusDI: nullArr(), minusDI: nullArr() }

  const trs: number[] = [], pDMs: number[] = [], mDMs: number[] = []
  for (let i = 1; i < n; i++) {
    const h = bars[i].high, l = bars[i].low, pc = bars[i - 1].close
    const ph = bars[i - 1].high, pl = bars[i - 1].low
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)))
    const up = h - ph, dn = pl - l
    pDMs.push(up > dn && up > 0 ? up : 0)
    mDMs.push(dn > up && dn > 0 ? dn : 0)
  }

  // Wilder 누적 (초기합 → 롤링)
  function wilderSum(vals: number[], p: number): number[] {
    const out: number[] = []
    let s = vals.slice(0, p).reduce((a, b) => a + b, 0)
    out.push(s)
    for (let i = p; i < vals.length; i++) { s = s - s / p + vals[i]; out.push(s) }
    return out
  }

  const sTR = wilderSum(trs, period)   // length: n - period
  const sPDM = wilderSum(pDMs, period)
  const sMDM = wilderSum(mDMs, period)

  const pDI = sTR.map((tr, i) => tr === 0 ? 0 : (sPDM[i] / tr) * 100)
  const mDI = sTR.map((tr, i) => tr === 0 ? 0 : (sMDM[i] / tr) * 100)
  const dx  = pDI.map((p, i) => {
    const s = p + mDI[i]; return s === 0 ? 0 : (Math.abs(p - mDI[i]) / s) * 100
  })
  // ADX = Wilder 평균 (합계가 아닌 EMA α=1/period): seed→단순평균, 이후→(prev*(p-1)+dx)/p
  let adxVal = dx.slice(0, period).reduce((a, b) => a + b, 0) / period
  const adxSmooth: number[] = [adxVal]
  for (let i = period; i < dx.length; i++) {
    adxVal = (adxVal * (period - 1) + dx[i]) / period
    adxSmooth.push(adxVal)
  }

  const r1 = (v: number) => Math.round(v * 10) / 10
  return {
    adx:     [...Array(2 * period - 1).fill(null), ...adxSmooth.map(r1)],
    plusDI:  [...Array(period).fill(null), ...pDI.map(r1)],
    minusDI: [...Array(period).fill(null), ...mDI.map(r1)],
  }
}

// ─── OBV (On-Balance Volume) ─────────────────────────────────────
export function calcOBV(bars: OHLCVBar[]): number[] {
  const obv: number[] = [0]
  for (let i = 1; i < bars.length; i++) {
    const prev = obv[i - 1], vol = bars[i].volume
    if (bars[i].close > bars[i - 1].close)      obv.push(prev + vol)
    else if (bars[i].close < bars[i - 1].close) obv.push(prev - vol)
    else                                          obv.push(prev)
  }
  return obv
}

// ─── 역사적 변동성 ────────────────────────────────────────────────
/** 연율화 역사적 변동성: 최근 period일 로그수익률의 표준편차 × √252 × 100 (%) */
function calcHV(bars: OHLCVBar[], period: number): number | null {
  if (bars.length < period + 1) return null
  const slice = bars.slice(-(period + 1)).filter(b => b.close > 0 && isFinite(b.close))
  if (slice.length < period + 1) return null
  const logReturns = slice.slice(1).map((b, i) => Math.log(b.close / slice[i].close))
  const validReturns = logReturns.filter(r => isFinite(r))
  if (validReturns.length < period * 0.8) return null  // 유효 데이터가 80% 미만이면 null
  return Math.round(stddev(validReturns) * Math.sqrt(252) * 100 * 100) / 100
}

// ─── 거래량 비율 ──────────────────────────────────────────────────
/** 최근 5일 평균 거래량 / 20일 평균 거래량 */
function calcVolumeRatio(volumes: number[]): number {
  if (volumes.length < 20) return 1
  const recent5 = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5
  const avg20   = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20
  return avg20 === 0 ? 1 : recent5 / avg20
}

// ─── 통합 계산 진입점 ────────────────────────────────────────────
export function calcIndicators(bars: OHLCVBar[]): Indicators {
  const closes  = bars.map((b) => b.close)
  const volumes = bars.map((b) => b.volume)

  return {
    rsi:         calcRSI(closes),
    macd:        calcMACD(closes),
    bollinger:   calcBollinger(closes),
    ma:          calcMA(closes),
    volumeRatio: calcVolumeRatio(volumes),
    atr:         calcATR(bars),
    adx:         calcADX(bars),
    obv:         calcOBV(bars),
  }
}

// ─── 전략 판단용 스냅샷 (최신 값만) ─────────────────────────────
export type { IndicatorSnapshot } from '@/types/stock'

export function getSnapshot(bars: OHLCVBar[], ind: Indicators): IndicatorSnapshot {
  const last = bars.length - 1
  const close = bars[last].close

  const rsi       = ind.rsi[last] ?? null
  const macd      = ind.macd.macdLine[last] ?? null
  const signal    = ind.macd.signalLine[last] ?? null
  const histogram = ind.macd.histogram[last] ?? null
  const bbUpper   = ind.bollinger.upper[last] ?? null
  const bbMid     = ind.bollinger.mid[last] ?? null
  const bbLower   = ind.bollinger.lower[last] ?? null
  const ma5       = ind.ma.ma5[last] ?? null
  const ma20      = ind.ma.ma20[last] ?? null
  const ma60      = ind.ma.ma60[last] ?? null
  const ma120     = ind.ma.ma120[last] ?? null

  const bbPosition =
    bbUpper !== null && bbLower !== null && bbUpper !== bbLower
      ? (close - bbLower) / (bbUpper - bbLower)
      : null

  // 5일선 vs 20일선 크로스 상태 — 실제 교차 시점만 golden/dead, 이후는 above/below
  let maCrossState: IndicatorSnapshot['maCrossState'] = 'neutral'
  let maCrossDaysAgo: number | null = null
  if (ma5 !== null && ma20 !== null) {
    const prevMa5  = ind.ma.ma5[last - 1]
    const prevMa20 = ind.ma.ma20[last - 1]
    if (prevMa5 !== null && prevMa20 !== null) {
      if (prevMa5 < prevMa20 && ma5 > ma20) {
        maCrossState  = 'golden'
        maCrossDaysAgo = 0
      } else if (prevMa5 > prevMa20 && ma5 < ma20) {
        maCrossState  = 'dead'
        maCrossDaysAgo = 0
      } else if (ma5 > ma20) {
        maCrossState = 'above'
        // 마지막 교차 시점 탐색 (최대 120봉)
        for (let i = last - 1; i >= Math.max(0, last - 120); i--) {
          const m5 = ind.ma.ma5[i]; const m20 = ind.ma.ma20[i]
          const pm5 = ind.ma.ma5[i - 1]; const pm20 = ind.ma.ma20[i - 1]
          if (m5 !== null && m20 !== null && pm5 !== null && pm20 !== null && pm5 < pm20 && m5 >= m20) {
            maCrossDaysAgo = last - i
            break
          }
        }
      } else if (ma5 < ma20) {
        maCrossState = 'below'
        for (let i = last - 1; i >= Math.max(0, last - 120); i--) {
          const m5 = ind.ma.ma5[i]; const m20 = ind.ma.ma20[i]
          const pm5 = ind.ma.ma5[i - 1]; const pm20 = ind.ma.ma20[i - 1]
          if (m5 !== null && m20 !== null && pm5 !== null && pm20 !== null && pm5 > pm20 && m5 <= m20) {
            maCrossDaysAgo = last - i
            break
          }
        }
      }
    }
  }

  // ── 역사적 변동성 ─────────────────────────────────────────────
  const hv20 = calcHV(bars, 20)
  const hv60 = calcHV(bars, 60)

  const volatilityRegime: IndicatorSnapshot['volatilityRegime'] = (() => {
    if (hv20 === null || hv60 === null || hv60 === 0) return 'normal'
    const ratio = hv20 / hv60
    if (ratio < 0.8) return 'low'
    if (ratio < 1.5) return 'normal'
    if (ratio < 2.5) return 'high'
    return 'extreme'
  })()

  // ── BB 폭 비율 (현재 BB폭 / 최근 20일 평균 BB폭) ─────────────
  const bbWidthRatio = (() => {
    if (bbUpper === null || bbLower === null) return null
    const currentWidth = bbUpper - bbLower
    const widths: number[] = []
    for (let i = Math.max(0, last - 19); i <= last; i++) {
      const u = ind.bollinger.upper[i]
      const l = ind.bollinger.lower[i]
      if (u !== null && l !== null) widths.push(u - l)
    }
    if (widths.length === 0) return null
    const avgWidth = widths.reduce((a, b) => a + b, 0) / widths.length
    return avgWidth === 0 ? null : Math.round((currentWidth / avgWidth) * 100) / 100
  })()

  // ── ADX ─────────────────────────────────────────────────────────
  const adxVal    = ind.adx.adx[last]    ?? null
  const plusDIVal = ind.adx.plusDI[last] ?? null
  const minusDIVal = ind.adx.minusDI[last] ?? null
  const adxTrend: IndicatorSnapshot['adxTrend'] = adxVal == null ? null
    : adxVal > 25 && plusDIVal != null && minusDIVal != null && plusDIVal > minusDIVal ? 'strong_up'
    : adxVal > 25 ? 'strong_down'
    : adxVal < 20 ? 'ranging'
    : 'weak'

  // ── ATR ─────────────────────────────────────────────────────────
  const atr14 = ind.atr[last] ?? null

  // ── OBV 다이버전스 (20봉 비교) ───────────────────────────────────
  const OBV_WIN = 20
  const obvDivergence: IndicatorSnapshot['obvDivergence'] = (() => {
    if (last < OBV_WIN) return 'none'
    const dObv   = ind.obv[last] - ind.obv[last - OBV_WIN]
    const dPrice = bars[last].close - bars[last - OBV_WIN].close
    const pPrev  = bars[last - OBV_WIN].close
    if (dPrice > pPrev * 0.02 && dObv < 0) return 'bearish'
    if (dPrice < -pPrev * 0.02 && dObv > 0) return 'bullish'
    return 'none'
  })()

  // ── 피보나치 되돌림 (최근 60봉 스윙 고/저점) ────────────────────
  const fibLevels = (() => {
    const slice = bars.slice(Math.max(0, last - 59), last + 1)
    const swingHigh = Math.max(...slice.map(b => b.high))
    const swingLow  = Math.min(...slice.map(b => b.low))
    const range = swingHigh - swingLow
    if (range === 0) return null
    return {
      swingHigh, swingLow,
      l236: swingHigh - 0.236 * range,
      l382: swingHigh - 0.382 * range,
      l500: swingHigh - 0.500 * range,
      l618: swingHigh - 0.618 * range,
    }
  })()

  return {
    close, rsi, macd, signal, histogram,
    bbUpper, bbMid, bbLower,
    ma5, ma20, ma60, ma120,
    volumeRatio: ind.volumeRatio,
    bbPosition, maCrossState, maCrossDaysAgo,
    hv20, hv60, volatilityRegime, bbWidthRatio,
    adx: adxVal, adxTrend, atr14, obvDivergence, fibLevels,
  }
}
