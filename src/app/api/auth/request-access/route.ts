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
