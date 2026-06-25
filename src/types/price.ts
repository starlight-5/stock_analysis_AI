export type ExtInfo  = { price: number; change: number; changePct: number; type: 'pre' | 'post' }
export type PriceData = { price: number | null; ext: ExtInfo | null }
