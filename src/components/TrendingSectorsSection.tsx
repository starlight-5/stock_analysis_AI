'use client'
/**
 * TrendingSectorsSection
 * ETF 수익률 기준 상위 3개 섹터와 Gemini가 추천한 관련 종목을 표시하는 컴포넌트.
 * 섹터 칩 클릭 시 해당 섹터로 포커스 전환, 종목 클릭 시 상세 페이지 이동.
 * React.memo로 데이터가 변경되지 않으면 리렌더를 방지한다.
 */
import { memo } from 'react'
import type { TrendingSectorsData } from '@/app/api/trending-sectors/route'

const SECTOR_ACCENT = ['#3B6EFF', '#1DB87A', '#F5A623'] as const

function TrendingsSkeleton() {
  return (
    <div style={{
      background: 'var(--color-background-primary)',
      borderBottom: '1px solid var(--color-border-tertiary)',
      padding: '14px 24px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{ width: 130, height: 18, borderRadius: 6, background: 'var(--color-background-secondary)' }} />
        <div style={{ width: 90, height: 14, borderRadius: 6, background: 'var(--color-background-secondary)' }} />
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            flex: '1 1 0', minWidth: 240, height: 128,
            background: 'var(--color-background-secondary)',
            border: '1px solid var(--color-border-tertiary)', borderRadius: 12,
          }} />
        ))}
      </div>
    </div>
  )
}

const TrendingSectorsSection = memo(function TrendingSectorsSection({
  data,
  navigate,
}: {
  data: TrendingSectorsData | null
  navigate: (path: string) => void
}) {
  if (!data) return <TrendingsSkeleton />

  const updatedStr = (() => {
    const d = new Date(data.updatedAt)
    return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  })()

  return (
    <div style={{
      background: 'var(--color-background-primary)',
      borderBottom: '1px solid var(--color-border-tertiary)',
      padding: '14px 24px 14px',
    }}>
      {/* 헤더 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 8, marginBottom: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>🔥 지금 뜨는 섹터</span>
          <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
            ETF 2개 평균 기반 · 갱신 {updatedStr}
          </span>
          {!data.geminiUsed && (
            <span style={{
              fontSize: 10, padding: '1px 7px', borderRadius: 8,
              background: 'rgba(245,166,35,0.12)', color: '#F5A623',
              border: '0.5px solid #F5A62350',
            }}>
              정적 데이터 (AI 미연결)
            </span>
          )}
        </div>
        {/* 연도별 테마 타임라인 */}
        {data.yearTimeline.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {data.yearTimeline.map((t, i) => (
              <div key={t.year} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {i > 0 && <span style={{ fontSize: 10, color: 'var(--color-border-primary)' }}>→</span>}
                <div style={{
                  fontSize: 11, padding: '2px 9px', borderRadius: 20,
                  background: t.active ? 'var(--color-accent-primary)' : 'var(--color-background-secondary)',
                  color: t.active ? '#fff' : 'var(--color-text-secondary)',
                  fontWeight: t.active ? 700 : 400,
                  border: `1px solid ${t.active ? 'var(--color-accent-primary)' : 'var(--color-border-secondary)'}`,
                  whiteSpace: 'nowrap',
                }}>
                  {t.year} {t.sector}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 섹터 카드 */}
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 2 }}>
        {data.sectors.map((sector, idx) => {
          const accent = SECTOR_ACCENT[idx % SECTOR_ACCENT.length]
          const retColor = sector.avgReturn1M >= 0 ? 'var(--color-positive)' : 'var(--color-negative)'
          const hotnessLabel =
            sector.hotness === 'hot'    ? '🔥 HOT'   :
            sector.hotness === 'rising' ? '📈 급상승' : '📊 주목'
          const etfLabel = sector.etfsUsed.join('·')

          return (
            <div key={sector.primaryEtf} style={{
              flex: '1 1 0', minWidth: 240,
              background: 'var(--color-background-secondary)',
              border: '1px solid var(--color-border-tertiary)',
              borderTop: `2px solid ${accent}`,
              borderRadius: 12, padding: '12px 14px',
              display: 'flex', flexDirection: 'column', gap: 7,
            }}>
              {/* 카드 헤더 */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 20, lineHeight: 1 }}>{sector.sectorEmoji}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{sector.sectorName}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 1 }}>
                      {etfLabel} 평균
                      <span style={{ color: retColor, marginLeft: 5, fontWeight: 600 }}>
                        {sector.avgReturn1M > 0 ? '+' : ''}{sector.avgReturn1M.toFixed(1)}% (1M)
                      </span>
                    </div>
                  </div>
                </div>
                <span style={{
                  fontSize: 10, padding: '2px 7px', borderRadius: 8, flexShrink: 0,
                  background: accent + '22', color: accent,
                  border: `0.5px solid ${accent}55`, fontWeight: 700,
                }}>
                  {hotnessLabel}
                </span>
              </div>

              {/* 한줄 설명 */}
              <p style={{
                fontSize: 11, color: 'var(--color-text-secondary)',
                lineHeight: 1.55, margin: 0,
              }}>
                {sector.description}
              </p>

              {/* 종목 칩 */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 1 }}>
                {sector.stocks.map(stock => (
                  <button
                    key={stock.ticker}
                    onClick={() => navigate(`/stock/${stock.ticker}`)}
                    title={`${stock.name} — ${stock.reason}`}
                    className="focusable"
                    style={{
                      padding: '2px 8px', borderRadius: 7,
                      background: stock.market === 'KR' ? 'rgba(245,166,35,0.10)' : 'rgba(59,110,255,0.10)',
                      border: `0.5px solid ${stock.market === 'KR' ? '#F5A62350' : '#3B6EFF50'}`,
                      color: stock.market === 'KR' ? '#F5A623' : 'var(--color-info-text)',
                      fontSize: 11, fontWeight: 600,
                      cursor: 'pointer', transition: 'opacity 0.15s',
                      lineHeight: 1.6,
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.65' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1' }}
                  >
                    {stock.ticker}
                    <span style={{ fontWeight: 400, marginLeft: 3, opacity: 0.8 }}>{stock.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
})

export default TrendingSectorsSection
