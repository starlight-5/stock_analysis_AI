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
