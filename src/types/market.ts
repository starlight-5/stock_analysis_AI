export type MarketQuote = { price: number; change: number; changePct: number }
export type MarketData  = Record<string, MarketQuote>
export type SortMode    = 'dollar' | 'volume'
export type MarketTab   = 'us' | 'kr'
