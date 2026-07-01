'use client'
import { useState } from 'react'

const ICON_COLORS = [
  '#3B6EFF','#FF5A5A','#1DB87A','#F5A623','#A855F7',
  '#06B6D4','#F97316','#EC4899','#10B981','#6366F1',
] as const

export const IS_KR_RE = /^\d{6}$/

export function colorFor(ticker: string): string {
  let hash = 5381
  for (let i = 0; i < ticker.length; i++) {
    hash = (hash * 33) ^ ticker.charCodeAt(i)
  }
  return ICON_COLORS[Math.abs(hash) % ICON_COLORS.length]
}

export default function TickerIcon({
  ticker, size = 36, market,
}: {
  ticker: string; size?: number; market?: 'us' | 'kr'
}) {
  const [imgFailed, setImgFailed] = useState(false)
  const color = colorFor(ticker)
  const radius = Math.round(size * 0.3)
  const isKR = market === 'kr' || /^\d+$/.test(ticker)
  const imgSrc = isKR
    ? `https://static.toss.im/png-icons/securities/icn-sec-fill-A${ticker}.png`
    : `https://financialmodelingprep.com/image-stock/${ticker}.png`

  return (
    <div style={{
      width: size, height: size, borderRadius: radius,
      background: color + '1A', border: `1px solid ${color}33`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden', flexShrink: 0,
    }}>
      {!imgFailed ? (
        <img
          src={imgSrc}
          alt={ticker}
          width={size}
          height={size}
          style={{ objectFit: 'cover', display: 'block' }}
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span style={{
          fontWeight: 700, fontSize: size < 32 ? 9 : 11, color,
          letterSpacing: '-0.5px',
        }}>
          {ticker.slice(0, 4)}
        </span>
      )}
    </div>
  )
}
