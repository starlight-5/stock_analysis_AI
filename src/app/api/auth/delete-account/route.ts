import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function DELETE() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const email = (session.user as any)?.email
  const isAdmin = (session.user as any)?.isAdmin
  if (isAdmin) return NextResponse.json({ error: '관리자 계정은 탈퇴할 수 없습니다.' }, { status: 403 })

  await prisma.accessRequest.deleteMany({ where: { email } })
  await prisma.user.delete({ where: { email } })

  return NextResponse.json({ ok: true })
}
