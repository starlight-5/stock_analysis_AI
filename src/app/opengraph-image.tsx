import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt     = 'AI 주식 분석 대시보드'
export const size    = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#0F1120',
          fontFamily: 'sans-serif',
          position: 'relative',
        }}
      >
        {/* 배경 그라디언트 원 */}
        <div style={{
          position: 'absolute', top: -120, left: -120,
          width: 500, height: 500, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(59,110,255,0.18) 0%, transparent 70%)',
          display: 'flex',
        }} />
        <div style={{
          position: 'absolute', bottom: -100, right: -80,
          width: 400, height: 400, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(123,59,255,0.15) 0%, transparent 70%)',
          display: 'flex',
        }} />

        {/* 아이콘 */}
        <div style={{
          fontSize: 80, marginBottom: 24, display: 'flex',
        }}>
          📈
        </div>

        {/* 제목 */}
        <div style={{
          fontSize: 64, fontWeight: 800,
          color: '#ECEEF8', letterSpacing: '-1px',
          marginBottom: 16, display: 'flex',
        }}>
          AI 주식 분석 대시보드
        </div>

        {/* 부제목 */}
        <div style={{
          fontSize: 26, color: '#7A82A8', fontWeight: 400,
          marginBottom: 48, display: 'flex',
        }}>
          한국·미국 주식을 AI가 분석해 매수·매도 전략을 자동으로 수립
        </div>

        {/* 기술 배지들 */}
        <div style={{ display: 'flex', gap: 12 }}>
          {['Next.js 16', 'Gemini AI', 'Supabase', 'Vercel'].map(label => (
            <div key={label} style={{
              padding: '8px 20px', borderRadius: 100,
              background: 'rgba(59,110,255,0.12)',
              border: '1px solid rgba(59,110,255,0.35)',
              color: '#7BA3FF', fontSize: 18, fontWeight: 600,
              display: 'flex',
            }}>
              {label}
            </div>
          ))}
        </div>

        {/* 하단 구분선 + URL */}
        <div style={{
          position: 'absolute', bottom: 36,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ width: 40, height: 1, background: '#2D3460', display: 'flex' }} />
          <div style={{ color: '#404880', fontSize: 16, display: 'flex' }}>
            github.com/starlight-5/stock_analysis_AI
          </div>
          <div style={{ width: 40, height: 1, background: '#2D3460', display: 'flex' }} />
        </div>
      </div>
    ),
    { ...size }
  )
}
