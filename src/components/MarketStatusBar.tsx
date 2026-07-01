'use client'
import type { MarketTab } from '@/types/market'

function StatusDot({ label, hours, active }: { label: string; hours: string; active?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{
        width: 6, height: 6, borderRadius: '50%',
        background: active ? 'var(--color-positive)' : 'var(--color-text-secondary)',
        boxShadow: active ? '0 0 5px #4ADE8088' : 'none',
      }} />
      <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
        {label} {hours}
      </span>
      <span style={{
        fontSize: 9, padding: '1px 5px', borderRadius: 4, fontWeight: 700,
        background: active ? '#4ADE8020' : '#7A82A815',
        color:      active ? 'var(--color-positive)' : 'var(--color-text-secondary)',
        border: `0.5px solid ${active ? '#4ADE8040' : '#7A82A830'}`,
      }}>
        {active ? '개장' : '휴장'}
      </span>
    </div>
  )
}

export default function MarketStatusBar({
  krOpen, usOpen, marketTab,
}: {
  krOpen: boolean
  usOpen: boolean
  marketTab: MarketTab
}) {
  return (
    <div style={{
      background: 'var(--color-background-secondary)',
      borderBottom: '1px solid var(--color-border-tertiary)',
      padding: '0 24px', height: 34,
      display: 'flex', alignItems: 'center', gap: 20,
    }}>
      <StatusDot label="국내" hours="09:00~15:30 KST" active={krOpen} />
      <StatusDot label="해외" hours="09:30~16:00 ET"  active={usOpen} />
      <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-secondary)' }}>
        {marketTab === 'kr'
          ? '지수: Yahoo Finance · 순위·차트: 한국투자증권 · 5분 캐시'
          : '지수·순위: Yahoo Finance · 차트: Alpaca · 5분 캐시'}
      </span>
    </div>
  )
}
