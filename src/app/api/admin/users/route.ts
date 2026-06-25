import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

function checkAdmin(session: any) {
  return session?.user?.isAdmin === true
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || !checkAdmin(session)) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(users)
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !checkAdmin(session)) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const { userId } = await req.json()
  if (!userId) return NextResponse.json({ error: '사용자 ID 필요' }, { status: 400 })

  const adminEmail = process.env.ADMIN_EMAIL
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
  if (!target) return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 })
  if (target.email === adminEmail) {
    return NextResponse.json({ error: '관리자 계정은 삭제할 수 없습니다.' }, { status: 403 })
  }

  if (target.email) {
    const bannedUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    await Promise.all([
      prisma.bannedEmail.upsert({
        where:  { email: target.email },
        create: { email: target.email, bannedUntil },
        update: { bannedUntil },
      }),
      prisma.accessRequest.deleteMany({ where: { email: target.email } }),
    ])
  }

  await prisma.user.delete({ where: { id: userId } })
  return NextResponse.json({ ok: true })
}
