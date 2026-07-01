/** 현재가·시간외 가격 관련 타입 */

/** 시간외(장전·장후) 가격 정보 */
export type ExtInfo  = {
  price: number       // 시간외 현재가
  change: number      // 전일 대비 변동액
  changePct: number   // 전일 대비 변동률 (%)
  type: 'pre' | 'post' // 장전(pre) | 장후(post)
}

/** /api/prices 응답 단위 */
export type PriceData = {
  price: number | null  // 정규장 기준 현재가 (null = 조회 실패)
  ext: ExtInfo | null   // 시간외 가격 (null = 정규장 중이거나 미지원)
}
