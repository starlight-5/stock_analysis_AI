/**
 * POST /api/auth/register
 * 신규 회원의 Credentials 이메일 가입을 처리하는 엔드포인트.
 * 비밀번호 암호화(bcrypt), 차단된 이메일 가입 제한, 중복 이메일 체크 후 User 테이블에 생성한다.
 */
import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const { name, email, password } = await req.json()

  if (!email || !password) {
    return NextResponse.json({ error: '이메일과 비밀번호는 필수입니다.' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: '비밀번호는 8자 이상이어야 합니다.' }, { status: 400 })
  }

  const ban = await prisma.bannedEmail.findFirst({
    where: { email, bannedUntil: { gt: new Date() } },
  })
  if (ban) {
    return NextResponse.json({ error: '이 이메일은 일시적으로 가입이 제한되어 있습니다.' }, { status: 403 })
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json({ error: '이미 사용 중인 이메일입니다.' }, { status: 409 })
  }

  const hashed = await bcrypt.hash(password, 12)
  const user = await prisma.user.create({
    data: { name: name || email.split('@')[0], email, password: hashed },
  })

  return NextResponse.json({ id: user.id, email: user.email }, { status: 201 })
}
