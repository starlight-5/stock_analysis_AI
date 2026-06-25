// ─── 원시 OHLCV 데이터 ───────────────────────────────────────────
export interface OHLCVBar {
  date: string      // "2024-01-15"
  open: number
  high: number
  low: number
  close: number
  volume: number
}

// ─── 계산된 지표 ──────────────────────────────────────────────────
export interface Indicators {
  rsi: (number | null)[]
  macd: {
    macdLine: (number | null)[]
    signalLine: (number | null)[]
    histogram: (number | null)[]
  }
  bollinger: {
    upper: (number | null)[]
    mid: (number | null)[]
    lower: (number | null)[]
  }
  ma: {
    ma5: (number | null)[]
    ma20: (number | null)[]
    ma60: (number | null)[]
    ma120: (number | null)[]
  }
  volumeRatio: number   // 최근 5일 평균 / 20일 평균
}

// ─── 데이터소스 응답 ──────────────────────────────────────────────
export type DataSource = 'alpaca' | 'korea_investment' | 'mock'

export interface StockDataResult {
  ticker: string
  name?: string
  bars: OHLCVBar[]
  source: DataSource
  fetchedAt: string   // ISO timestamp
}

// ─── 기본적 분석 필터용 ───────────────────────────────────────────
export interface Fundamentals {
  ticker: string
  per: number | null
  pbr: number | null
  roe: number | null
  dividendYield: number | null
  marketCap: number | null    // 억 원
  debtRatio: number | null    // %
}

// ─── 보유 기간 가이드 ─────────────────────────────────────────────
export interface HoldingGuide {
  minWeeks: number        // 최소 관찰 기간 (주)
  targetWeeks: number     // 권장 보유 기간 (주)
  maxWeeks: number        // 최대 보유 기간 (주)
  stopCondition: string   // 손절 트리거 조건
  reviewCondition: string // 전략 재검토 트리거 조건
}

// ─── Claude 전략 응답 ─────────────────────────────────────────────
export interface StrategyEntry {
  price: number
  ratio: number    // 전체 매수 예정 금액 중 몇 % (0~100)
  reason: string
}

export interface StrategyResult {
  ticker: string
  generatedAt: string
  summary: string
  signal: 'strong_buy' | 'buy' | 'watch' | 'sell' | 'strong_sell'
  buyStrategy: {
    type: 'lump'| 'split'   // lump = 일괄, split = 분할
    entries: StrategyEntry[]
    stopLoss: number
    stopLossReason: string
  }
  sellStrategy: {
    targets: { price: number; ratio: number; reason: string }[]
  }
  risks: string[]
  holding: HoldingGuide
  rawText: string   // Claude 원문 (디버깅용)
}

// ─── 지표 스냅샷 (최신값 요약) ────────────────────────────────────
export interface IndicatorSnapshot {
  close: number
  rsi: number | null
  macd: number | null
  signal: number | null
  histogram: number | null
  bbUpper: number | null
  bbMid: number | null
  bbLower: number | null
  ma5: number | null
  ma20: number | null
  ma60: number | null
  ma120: number | null
  volumeRatio: number
  bbPosition: number | null
  maCrossState: 'golden' | 'dead' | 'neutral'
}

// ─── 관심종목 ─────────────────────────────────────────────────────
export interface WatchlistItem {
  id: string
  ticker: string
  name: string
  addedAt: string
  memo?: string
}

// ─── 포지션 (전략 고정 추적) ──────────────────────────────────────
export interface Position {
  id: string
  ticker: string
  name: string
  registeredAt: string
  signal: 'strong_buy' | 'buy' | 'watch' | 'sell' | 'strong_sell'
  summary: string
  entryType: 'lump' | 'split'
  entries: { price: number; ratio: number; reason: string }[]
  stopLoss: number
  stopLossReason: string
  targets: { price: number; ratio: number; reason: string }[]
  risks: string[]
  holding?: HoldingGuide
  status: 'active' | 'closed'
  closedAt?: string
}
