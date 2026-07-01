'use client'
import { useState, useCallback, memo } from 'react'
import TickerIcon, { IS_KR_RE } from '@/components/TickerIcon'
import SkeletonBox from '@/components/SkeletonBox'
import type { WatchlistItem } from '@/types/stock'
import type { QuoteData } from '@/app/api/quotes/route'

function SidebarItemSkeleton({ isLast }: { isLast: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '10px 14px',
      borderBottom: isLast ? 'none' : '1px solid var(--color-border-tertiary)',
    }}>
      <SkeletonBox width={32} height={32} borderRadius={10} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <SkeletonBox width="58%" height={13} borderRadius={4} />
        <SkeletonBox width="32%" height={10} borderRadius={4} />
      </div>
      <SkeletonBox width={40} height={12} borderRadius={4} style={{ flexShrink: 0 }} />
    </div>
  )
}

type WatchQuotes = Record<string, QuoteData | null>

const NAME_SUFFIXES = /\s+(Inc\.?|Corp\.?|Corporation|Holdings?|Ltd\.?|Limited|Co\.?|Group|Plc\.?|N\.V\.?|S\.A\.?|Class\s+[A-C]|Ordinary\s+Shares?)\s*$/gi

function shortenName(name: string): string {
  return name.replace(NAME_SUFFIXES, '').replace(/[,.\s]+$/, '').trim()
}

/**
 * [FIX 1] onNavigate/onRemove 클로저 제거.
 * navigate/remove를 안정된 참조로 전달하고, ticker를 별도 prop으로 받아 내부에서 호출.
 * → memo(SidebarItem)이 watchlist 순서 변경 없이는 리렌더되지 않음.
 */
const SidebarItem = memo(function SidebarItem({
  item, isLast, navigate, remove, quote,
}: {
  item: WatchlistItem
  isLast: boolean
  navigate: (path: string) => void
  remove: (ticker: string) => void
  quote: QuoteData | null
}) {
  const [hovered, setHovered] = useState(false)
  const isKR = IS_KR_RE.test(item.ticker)
  const up = (quote?.changePct ?? 0) >= 0
  const changeColor = up ? 'var(--color-positive)' : 'var(--color-negative)'

  return (
    <div
      onClick={() => navigate(`/stock/${item.ticker}`)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/stock/${item.ticker}`) } }}
      role="button"
      tabIndex={0}
      className="focusable"
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px',
        borderBottom: isLast ? 'none' : '1px solid var(--color-border-tertiary)',
        cursor: 'pointer',
        background: hovered ? 'var(--color-background-secondary)' : 'transparent',
        transition: 'background .1s',
      }}
    >
      <TickerIcon ticker={item.ticker} size={32} market={isKR ? 'kr' : 'us'} />

      {/* 종목명 + 티커 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {shortenName(item.name)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
          <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{item.ticker}</span>
          <span style={{
            fontSize: 9, padding: '0 4px', borderRadius: 3,
            background: isKR ? '#FF5A5A1A' : '#3B6EFF1A',
            color: isKR ? 'var(--color-error-text)' : 'var(--color-info-text)',
            border: `0.5px solid ${isKR ? '#FF5A5A33' : '#3B6EFF33'}`,
            fontWeight: 700,
          }}>
            {isKR ? 'KR' : 'US'}
          </span>
        </div>
      </div>

      {/* 등락률 */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {quote ? (
          <div style={{ fontSize: 12, fontWeight: 600, color: changeColor }}>
            {up ? '+' : ''}{quote.changePct.toFixed(2)}%
          </div>
        ) : (
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>—</div>
        )}
      </div>

      {/* 삭제 버튼 */}
      <button
        onClick={e => { e.stopPropagation(); remove(item.ticker) }}
        className="focusable"
        style={{
          background: 'none', border: 'none',
          color: hovered ? 'var(--color-text-secondary)' : 'transparent',
          cursor: 'pointer', fontSize: 13, padding: '2px 4px',
          transition: 'color .15s', flexShrink: 0,
        }}
      >
        ✕
      </button>
    </div>
  )
})

export default function WatchlistPanel({
  watchlist, watchQuotes, navigate, remove, addToWatchlist, loading,
}: {
  watchlist: WatchlistItem[]
  watchQuotes: WatchQuotes
  navigate: (path: string) => void
  remove: (ticker: string) => void
  addToWatchlist: (ticker: string, name: string) => Promise<WatchlistItem | null>
  loading: boolean
}) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [newTicker,   setNewTicker]   = useState('')
  const [newName,     setNewName]     = useState('')
  const [adding,      setAdding]      = useState(false)
  const [addError,    setAddError]    = useState<string | null>(null)

  const addManual = useCallback(async () => {
    const ticker = newTicker.trim().toUpperCase()
    if (!ticker) return
    setAdding(true); setAddError(null)
    const item = await addToWatchlist(ticker, newName || ticker)
    if (item) {
      setNewTicker(''); setNewName(''); setShowAddForm(false)
    } else {
      setAddError('추가 실패. 올바른 티커인지 확인해주세요.')
    }
    setAdding(false)
  }, [newTicker, newName, addToWatchlist])

  const toggleAddForm = useCallback(() => {
    setShowAddForm(v => !v); setAddError(null)
  }, [])

  return (
    <div style={{ position: 'sticky', top: 16 }}>
      <div style={{
        background: 'var(--color-background-primary)',
        border: '1px solid var(--color-border-tertiary)',
        borderRadius: 14, overflow: 'hidden',
      }}>
        {/* 헤더 */}
        <div style={{
          padding: '14px 16px',
          borderBottom: '1px solid var(--color-border-tertiary)',
          background: 'var(--color-background-secondary)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>관심종목</span>
            <span style={{
              fontSize: 11, padding: '1px 7px', borderRadius: 10,
              background: 'var(--color-background-primary)',
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border-secondary)',
            }}>
              {watchlist.length}
            </span>
          </div>
          <button
            onClick={toggleAddForm}
            style={{
              padding: '4px 12px', borderRadius: 14, border: 'none',
              background: showAddForm ? 'var(--color-border-secondary)' : 'var(--color-accent-primary)',
              color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {showAddForm ? '취소' : '+ 추가'}
          </button>
        </div>

        {/* 추가 폼 */}
        {showAddForm && (
          <div style={{
            padding: '12px 14px',
            borderBottom: '1px solid var(--color-border-tertiary)',
            background: 'var(--color-background-secondary)',
          }}>
            <input
              value={newTicker}
              onChange={e => { setNewTicker(e.target.value.toUpperCase()); setAddError(null) }}
              onKeyDown={e => e.key === 'Enter' && addManual()}
              placeholder="티커  예) AAPL · 005930"
              autoFocus
              style={{
                width: '100%', padding: '7px 10px', borderRadius: 7, marginBottom: 6,
                border: `1px solid ${addError ? 'var(--color-error-border)' : 'var(--color-border-secondary)'}`,
                background: 'var(--color-background-primary)',
                color: 'var(--color-text-primary)', fontSize: 12, outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="종목명 (선택)"
                style={{
                  flex: 1, padding: '7px 10px', borderRadius: 7,
                  border: '1px solid var(--color-border-secondary)',
                  background: 'var(--color-background-primary)',
                  color: 'var(--color-text-primary)', fontSize: 12, outline: 'none',
                }}
              />
              <button
                onClick={addManual}
                disabled={adding || !newTicker.trim()}
                style={{
                  padding: '7px 14px', borderRadius: 7, border: 'none',
                  background: adding || !newTicker.trim() ? 'var(--color-border-secondary)' : 'var(--color-accent-primary)',
                  color: '#fff', fontSize: 12, fontWeight: 600,
                  cursor: adding || !newTicker.trim() ? 'not-allowed' : 'pointer',
                  opacity: adding || !newTicker.trim() ? 0.5 : 1,
                }}
              >
                {adding ? '…' : '추가'}
              </button>
            </div>
            {addError && (
              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--color-error-text)' }}>
                {addError}
              </div>
            )}
          </div>
        )}

        {/* 관심종목 목록 — maxHeight로 넘침 방지 */}
        <div style={{ maxHeight: 480, overflowY: 'auto' }}>
          {loading ? (
            Array.from({ length: 5 }, (_, i) => (
              <SidebarItemSkeleton key={i} isLast={i === 4} />
            ))
          ) : watchlist.length === 0 ? (
            <div style={{
              padding: '40px 16px', textAlign: 'center',
              color: 'var(--color-text-secondary)', fontSize: 12,
            }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>🔍</div>
              종목을 추가하거나<br />랭킹에서 ♡ 를 눌러보세요
            </div>
          ) : (
            watchlist.map((item, idx) => (
              <SidebarItem
                key={item.id}
                item={item}
                isLast={idx === watchlist.length - 1}
                navigate={navigate}
                remove={remove}
                quote={watchQuotes[item.ticker] ?? null}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
