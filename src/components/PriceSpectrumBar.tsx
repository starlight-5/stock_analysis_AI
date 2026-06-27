'use client'

function formatPrice(price: number, isKR: boolean): string {
  return isKR
    ? price.toLocaleString('ko-KR') + '원'
    : '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface Props {
  stopLoss: number
  entries: { price: number }[]
  currentPrice: number
  targets: { price: number }[]
  isKR: boolean
}

export default function PriceSpectrumBar({ stopLoss, entries, currentPrice, targets, isKR }: Props) {
  const firstTarget = targets[0]?.price
  const allPrices = [stopLoss, ...entries.map(e => e.price), currentPrice, ...(firstTarget ? [firstTarget] : [])]
  const rawMin = Math.min(...allPrices)
  const rawMax = Math.max(...allPrices)
  const pad = (rawMax - rawMin) * 0.08 || rawMin * 0.05
  const lo = rawMin - pad
  const hi = rawMax + pad
  const span = hi - lo || 1

  const pct = (p: number) => Math.max(1, Math.min(99, ((p - lo) / span) * 100))

  const curPct  = pct(currentPrice)
  const stopPct = pct(stopLoss)
  const avgEntry = entries.length > 0
    ? entries.reduce((s, e) => s + e.price, 0) / entries.length
    : currentPrice
  const isProfit = currentPrice > avgEntry

  const progressInRange = firstTarget && firstTarget > stopLoss
    ? (currentPrice - stopLoss) / (firstTarget - stopLoss)
    : 0.5
  const dotColor = progressInRange < 0.2 ? '#E24B4A' : isProfit ? '#1D9E75' : '#EF9F27'

  const toStopPct   = (currentPrice - stopLoss) / currentPrice * 100
  const toTargetPct = firstTarget ? (firstTarget - currentPrice) / currentPrice * 100 : null

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Target labels above */}
      {targets.length > 0 && (
        <div style={{ position: 'relative', height: 16, marginBottom: 3 }}>
          {targets.map((t, i) => (
            <div key={i} style={{
              position: 'absolute', left: `${pct(t.price)}%`,
              transform: 'translateX(-50%)', textAlign: 'center',
            }}>
              <span style={{ fontSize: 9, color: '#EF9F27', fontWeight: 600, whiteSpace: 'nowrap' }}>
                {targets.length > 1 ? `목표${i + 1}` : '목표'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Bar */}
      <div style={{ position: 'relative', height: 5, background: 'var(--color-background-secondary)', borderRadius: 3 }}>
        <div style={{
          position: 'absolute', left: 0, width: `${stopPct}%`, height: '100%',
          background: '#E24B4A28', borderRadius: '3px 0 0 3px',
        }} />
        <div style={{
          position: 'absolute', left: `${stopPct}%`,
          width: `${Math.max(0, curPct - stopPct)}%`, height: '100%',
          background: isProfit ? '#1D9E7548' : '#EF9F2748',
        }} />

        <div style={{
          position: 'absolute', left: `${stopPct}%`, transform: 'translateX(-50%)',
          width: 2, height: 11, top: -3, borderRadius: 1, background: '#E24B4A',
        }} />
        {entries.map((e, i) => (
          <div key={i} style={{
            position: 'absolute', left: `${pct(e.price)}%`, transform: 'translateX(-50%)',
            width: 2, height: 9, top: -2, borderRadius: 1, background: '#1D9E75',
          }} />
        ))}
        {targets.map((t, i) => (
          <div key={i} style={{
            position: 'absolute', left: `${pct(t.price)}%`, transform: 'translateX(-50%)',
            width: 2, height: 9, top: -2, borderRadius: 1, background: '#EF9F27',
          }} />
        ))}

        <div style={{
          position: 'absolute', left: `${curPct}%`, top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 13, height: 13, borderRadius: '50%',
          background: dotColor,
          border: '2px solid var(--color-background-primary)',
          boxShadow: `0 0 0 2px ${dotColor}`,
          zIndex: 2,
        }} />
      </div>

      {/* Entry labels below */}
      <div style={{ position: 'relative', height: 16, marginTop: 4 }}>
        <div style={{ position: 'absolute', left: `${stopPct}%`, transform: 'translateX(-50%)', textAlign: 'center' }}>
          <span style={{ fontSize: 9, color: '#E24B4A', fontWeight: 600, whiteSpace: 'nowrap' }}>손절</span>
        </div>
        {entries.map((e, i) => (
          <div key={i} style={{ position: 'absolute', left: `${pct(e.price)}%`, transform: 'translateX(-50%)', textAlign: 'center' }}>
            <span style={{ fontSize: 9, color: '#1D9E75', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {entries.length > 1 ? `${i + 1}차` : '매수'}
            </span>
          </div>
        ))}
      </div>

      {/* Distance summary */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginTop: 8, padding: '7px 12px', borderRadius: 8,
        background: 'var(--color-background-secondary)',
      }}>
        <span style={{ fontSize: 10, color: '#E24B4A', fontWeight: 500 }}>손절 -{toStopPct.toFixed(1)}%</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: dotColor }}>{formatPrice(currentPrice, isKR)}</span>
        {toTargetPct !== null
          ? <span style={{ fontSize: 10, color: '#EF9F27', fontWeight: 500 }}>목표 +{toTargetPct.toFixed(1)}%</span>
          : <span />
        }
      </div>
    </div>
  )
}
