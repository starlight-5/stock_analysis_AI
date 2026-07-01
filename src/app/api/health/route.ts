/**
 * GET /api/health
 * Supabase DB의 활성 상태를 모니터링하기 위한 헬스체크 엔드포인트.
 * Vercel Cron이 매일 자정 호출하여 DB 인스턴스가 일시 중지(정지) 상태로 가는 것을 방지한다.
 */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
