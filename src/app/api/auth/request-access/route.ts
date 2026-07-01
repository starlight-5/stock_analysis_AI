/**
 * POST /api/auth/request-access
 * 비인가 사용자가 대시보드 접근 요청을 발송할 때 처리하는 엔드포인트.
 * DB에 AccessRequest를 pending으로 등록(이미 있는 경우 갱신)하고, Discord 웹훅으로 알림을 전송한다.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const { email } = await req.json()
  if (!email) return NextResponse.json({ error: '이메일 필요' }, { status: 400 })

  // DB에 요청 저장 (이미 있으면 requestedAt 갱신)
  await prisma.accessRequest.upsert({
    where:  { email },
    update: { requestedAt: new Date(), status: 'pending' },
    create: { email },
  })

  // Discord 웹훅 알림
  const webhookUrl = process.env.DISCORD_ACCESS_REQUEST_WEBHOOK_URL
  if (webhookUrl) {
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `🔔 **접근 요청** | \`${email}\` 님이 서비스 접근을 요청했습니다.`,
        }),
      })
      if (!res.ok) console.error('[request-access] Discord webhook failed:', res.status)
    } catch (err) {
      console.error('[request-access] Discord webhook error:', err)
    }
  }

  return NextResponse.json({ ok: true })
}
