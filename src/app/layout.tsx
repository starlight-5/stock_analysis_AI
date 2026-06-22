import './globals.css'

export const metadata = {
  title: '주식 분석 대시보드',
  description: 'Gemini AI 기반 기술적 분석 및 매매 전략 도구',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
