/**
 * GET/PATCH /api/admin/requests
 * 대시보드 접근 요청(AccessRequest)을 관리자 계정이 확인하고 승인/거부하는 엔드포인트.
 * - GET: 모든 접근 요청 목록 조회 (요청일 역순)
 * - PATCH: 특정 요청의 상태(approved/rejected)를 업데이트
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

function isAdmin(email: string | null | undefined) {
  const adminEmail = process.env.ADMIN_EMAIL
    ?? process.env.ALLOWED_EMAILS?.split(',')[0]?.trim()
  return !!email && !!adminEmail && email === adminEmail
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!isAdmin((session?.user as any)?.email)) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const requests = await prisma.accessRequest.findMany({
    orderBy: { requestedAt: 'desc' },
  })
  return NextResponse.json(requests)
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!isAdmin((session?.user as any)?.email)) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const { id, status } = await req.json()
  if (!id || !['approved', 'rejected'].includes(status)) {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
  }

  const updated = await prisma.accessRequest.update({
    where: { id },
    data:  { status, reviewedAt: new Date() },
  })
  return NextResponse.json(updated)
}
