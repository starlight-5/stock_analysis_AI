/** 지수/시장 데이터 관련 공유 타입 */

/** 단일 지수 시세 스냅샷 */
export type MarketQuote = { price: number; change: number; changePct: number }
/** 지수명(티커) → MarketQuote 맵 */
export type MarketData  = Record<string, MarketQuote>
/** 랭킹 정렬 기준: 거래대금(dollar) | 거래량(volume) */
export type SortMode    = 'dollar' | 'volume'
/** 시장 탭: 미국(us) | 국내(kr) */
export type MarketTab   = 'us' | 'kr'
