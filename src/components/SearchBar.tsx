'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { SearchResult } from '@/app/api/search/route'

// Yahoo Finance는 한국 상장 종목을 "005930.KS" 형식으로 반환
const IS_KR_RE = /^\d{6}(\.KQ|\.KS)?$/

function cleanSymbol(symbol: string): string {
  return symbol.replace(/\.(KQ|KS)$/, '')
}

function isKR(symbol: string): boolean {
  return IS_KR_RE.test(symbol)
}

export default function SearchBar() {
  const router = useRouter()

  const [query,    setQuery]    = useState('')
  const [results,  setResults]  = useState<SearchResult[]>([])
  const [loading,  setLoading]  = useState(false)
  const [open,     setOpen]     = useState(false)
  const [selected, setSelected] = useState(-1)

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef     = useRef<HTMLInputElement>(null)
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 300ms 디바운스 검색
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    const q = query.trim()
    if (!q) { setResults([]); setOpen(false); setLoading(false); return }

    timerRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res  = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
        const data = await res.json()
        if (!data.error && Array.isArray(data)) {
          setResults(data)
          setOpen(data.length > 0)
          setSelected(-1)
        }
      } catch {
        // 네트워크 오류는 무시
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [query])

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  const navigate = useCallback((symbol: string) => {
    setQuery('')
    setResults([])
    setOpen(false)
    // Yahoo Finance suffix 제거 후 이동 (005930.KS → 005930)
    router.push(`/stock/${cleanSymbol(symbol)}`)
  }, [router])

  const clearInput = useCallback(() => {
    setQuery(''); setResults([]); setOpen(false)
    inputRef.current?.focus()
  }, [])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected(s => Math.min(s + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected(s => Math.max(s - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const target = selected >= 0 ? results[selected] : results[0]
      if (target) navigate(target.symbol)
    } else if (e.key === 'Escape') {
      setOpen(false); setSelected(-1)
    }
  }

  const focused = open && results.length > 0

  return (
    <div ref={containerRef} style={{ position: 'relative', width: 280 }}>

      {/* 입력창 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'var(--color-background-secondary)',
        border: `1px solid ${focused ? 'var(--color-border-primary)' : 'var(--color-border-secondary)'}`,
        borderRadius: 10, padding: '0 12px', height: 36,
        transition: 'border-color .15s',
      }}>
        {loading ? (
          <div style={{
            width: 13, height: 13, borderRadius: '50%', flexShrink: 0,
            border: '1.5px solid var(--color-border-secondary)',
            borderTopColor: '#7BA3FF',
            animation: 'spin 0.7s linear infinite',
          }} />
        ) : (
          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', flexShrink: 0, userSelect: 'none' }}>
            🔍
          </span>
        )}
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="종목 검색  예) AAPL, 005930"
          style={{
            flex: 1, background: 'none', border: 'none', outline: 'none',
            color: 'var(--color-text-primary)', fontSize: 12,
            minWidth: 0,
          }}
        />
        {query && (
          <button
            onClick={clearInput}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 12, color: 'var(--color-text-secondary)',
              padding: 0, lineHeight: 1, flexShrink: 0,
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* 결과 드롭다운 */}
      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
          zIndex: 200,
          background: 'var(--color-background-secondary)',
          border: '1px solid var(--color-border-secondary)',
          borderRadius: 10, overflow: 'hidden',
          boxShadow: '0 8px 24px #00000055',
        }}>
          {results.map((r, i) => {
            const kr    = isKR(r.symbol)
            const sym   = cleanSymbol(r.symbol)
            const color = kr ? '#FF5A5A' : '#3B6EFF'
            const textColor = kr ? '#FF8585' : '#7BA3FF'
            return (
              <div
                key={r.symbol}
                onClick={() => navigate(r.symbol)}
                onMouseEnter={() => setSelected(i)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 14px', cursor: 'pointer',
                  background: selected === i ? 'var(--color-background-primary)' : 'transparent',
                  borderBottom: i < results.length - 1 ? '1px solid var(--color-border-tertiary)' : 'none',
                  transition: 'background .08s',
                }}
              >
                {/* 미니 아이콘 */}
                <div style={{
                  width: 30, height: 30, borderRadius: 7, flexShrink: 0,
                  background: color + '1A', border: `1px solid ${color}33`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, fontWeight: 700, color: textColor, letterSpacing: '-0.5px',
                }}>
                  {sym.slice(0, 4)}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {sym}
                  </div>
                  <div style={{
                    fontSize: 11, color: 'var(--color-text-secondary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {r.name}
                  </div>
                </div>

                {/* 거래소 배지 */}
                <span style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 4, flexShrink: 0,
                  background: color + '1A', color: textColor,
                  border: `0.5px solid ${color}33`, fontWeight: 600,
                }}>
                  {r.exchange || (kr ? 'KRX' : 'US')}
                </span>
              </div>
            )
          })}

          {/* 안내 텍스트 */}
          <div style={{
            padding: '6px 14px',
            borderTop: '1px solid var(--color-border-tertiary)',
            fontSize: 10, color: 'var(--color-text-secondary)',
            background: 'var(--color-background-tertiary)',
          }}>
            ↑↓ 이동 · Enter 선택 · Esc 닫기
          </div>
        </div>
      )}

      {/* 검색어 있는데 결과 없음 (로딩 완료 후) */}
      {open === false && query.trim() && !loading && results.length === 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
          zIndex: 200,
          background: 'var(--color-background-secondary)',
          border: '1px solid var(--color-border-secondary)',
          borderRadius: 10, padding: '14px 16px', textAlign: 'center',
          boxShadow: '0 8px 24px #00000055',
          fontSize: 12, color: 'var(--color-text-secondary)',
        }}>
          "{query}"에 대한 검색 결과가 없습니다
        </div>
      )}
    </div>
  )
}
