/**
 * RootLayout
 * Next.js App Router의 최상위 레이아웃 컴포넌트.
 * - globals.css를 통해 테마 변수 및 글로벌 스타일 적용
 * - SessionProvider로 NextAuth 세션 컨텍스트 주입
 * - Header 및 BottomNav(모바일 하단 바)를 공통 레이아웃으로 설정
 */
import './globals.css'
import SessionProvider from '@/components/SessionProvider'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'

export const metadata = {
  title: 'AI 주식 분석 대시보드',
  description: '한국·미국 주식을 AI가 분석해 매수·매도 전략을 자동으로 수립하는 개인 투자 도구',
  openGraph: {
    title: 'AI 주식 분석 대시보드',
    description: '한국·미국 주식을 AI가 분석해 매수·매도 전략을 자동으로 수립하는 개인 투자 도구',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI 주식 분석 대시보드',
    description: '한국·미국 주식을 AI가 분석해 매수·매도 전략을 자동으로 수립하는 개인 투자 도구',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <SessionProvider>
          <Header />
          {children}
          <BottomNav />
        </SessionProvider>
      </body>
    </html>
  )
}
