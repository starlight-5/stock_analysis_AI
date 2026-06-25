import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { email } = await req.json()
  if (!email) return NextResponse.json({ error: '이메일 필요' }, { status: 400 })

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
      if (!res.ok) console.error('[request-access] Discord webhook failed:', res.status, await res.text())
    } catch (err) {
      console.error('[request-access] Discord webhook error:', err)
    }
  }

  return NextResponse.json({ ok: true })
}
