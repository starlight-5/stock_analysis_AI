/**
 * GET/POST/PATCH/DELETE /api/positions
 * 사용자의 활성 포지션을 등록하고, 관리하는 엔드포인트.
 * - GET: 로그인 사용자의 전체 포지션 조회
 * - POST: 신규 포지션 등록 (기존 활성 포지션이 있는 경우 중복 등록 차단 또는 덮어쓰기 유도)
 * - PATCH: 포지션 목표가/손절가 변경 또는 포지션 종료 처리
 * - DELETE: 포지션 강제 삭제
 * - 신규 등록 및 변경 시 Discord 알림 전송 처리 수행
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { Position } from '@/types/stock'

type DbPosition = NonNullable<Awaited<ReturnType<typeof prisma.position.findFirst>>>

const IS_KR = (t: string) => /^\d{6}$/.test(t)
const fmtPrice = (ticker: string, p: number) =>
  IS_KR(ticker)
    ? `${p.toLocaleString('ko-KR')}원`
    : `$${p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const SIGNAL_EMOJI: Record<string, string> = {
  strong_buy: '🟢', buy: '🟢', watch: '🟡', sell: '🔴', strong_sell: '🔴',
}
const SIGNAL_LABEL: Record<string, string> = {
  strong_buy: '강력매수', buy: '매수', watch: '관망', sell: '매도', strong_sell: '강력매도',
}

async function sendPositionAlert(pos: Position, type: 'new' | 'updated') {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL
  if (!webhookUrl) return

  const em  = SIGNAL_EMOJI[pos.signal] ?? '⚪'
  const sig = SIGNAL_LABEL[pos.signal] ?? pos.signal
  const header = type === 'new'
    ? `${em} **새 포지션 등록** | ${pos.ticker} · ${pos.name}  \`${sig}\``
    : `🔄 **포지션 최신화** | ${pos.ticker} · ${pos.name}  \`${sig}\``

  const entryLine = pos.entryType === 'lump'
    ? `일괄 ${fmtPrice(pos.ticker, pos.entries[0]?.price ?? 0)}`
    : pos.entries.map((e, i) => `${i + 1}차 ${fmtPrice(pos.ticker, e.price)} (${e.ratio}%)`).join(' / ')

  const targetLine = pos.targets
    .map((t, i) => `${i + 1}차 ${fmtPrice(pos.ticker, t.price)}`)
    .join(' · ')

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: [header, `진입: ${entryLine}`, `목표: ${targetLine}`, `손절: ${fmtPrice(pos.ticker, pos.stopLoss)}`].join('\n') }),
    })
    if (!res.ok) console.error(`Discord 알림 실패: ${res.status}`)
  } catch (err) {
    console.error('Discord 알림 네트워크 에러:', err)
  }
}

function toPosition(row: DbPosition): Position {
  return {
    id:             row.id,
    ticker:         row.ticker,
    name:           row.name,
    registeredAt:   row.registeredAt.toISOString(),
    signal:         row.signal as Position['signal'],
    summary:        row.summary,
    entryType:      row.entryType as 'lump' | 'split',
    entries:        row.entries as Position['entries'],
    stopLoss:       row.stopLoss,
    stopLossReason: row.stopLossReason,
    targets:        row.targets as Position['targets'],
    risks:          row.risks as Position['risks'],
    holding:        row.holding as unknown as Position['holding'] ?? undefined,
    status:         row.status as 'active' | 'closed',
    closedAt:       row.closedAt?.toISOString(),
  }
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const rows = await prisma.position.findMany({
    where: { userId: session.user.id, status: 'active' },
    orderBy: { registeredAt: 'desc' },
  })

  return NextResponse.json(rows.map(toPosition))
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const body = await req.json()
  const { ticker, name, strategy } = body
  if (!ticker || !strategy) return NextResponse.json({ error: '필수 필드 누락' }, { status: 400 })

  const row = await prisma.position.create({
    data: {
      userId:         session.user.id,
      ticker:         ticker.toUpperCase(),
      name:           name ?? ticker.toUpperCase(),
      signal:         strategy.signal,
      summary:        strategy.summary,
      entryType:      strategy.buyStrategy.type,
      entries:        strategy.buyStrategy.entries,
      stopLoss:       strategy.buyStrategy.stopLoss,
      stopLossReason: strategy.buyStrategy.stopLossReason,
      targets:        strategy.sellStrategy.targets,
      risks:          strategy.risks,
      holding:        strategy.holding ?? null,
    },
  })

  const pos = toPosition(row)
  await sendPositionAlert(pos, 'new')
  return NextResponse.json(pos, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const body = await req.json()
  const { id, strategy } = body
  if (!id || !strategy) return NextResponse.json({ error: '필수 필드 누락' }, { status: 400 })

  const existing = await prisma.position.findFirst({
    where: { id, userId: session.user.id, status: 'active' },
  })
  if (!existing) return NextResponse.json({ error: '활성 포지션 없음' }, { status: 404 })

  const row = await prisma.position.update({
    where: { id },
    data: {
      registeredAt:   new Date(),
      signal:         strategy.signal,
      summary:        strategy.summary,
      entryType:      strategy.buyStrategy.type,
      entries:        strategy.buyStrategy.entries,
      stopLoss:       strategy.buyStrategy.stopLoss,
      stopLossReason: strategy.buyStrategy.stopLossReason,
      targets:        strategy.sellStrategy.targets,
      risks:          strategy.risks,
      holding:        strategy.holding ?? null,
    },
  })

  const pos = toPosition(row)
  await sendPositionAlert(pos, 'updated')
  return NextResponse.json(pos)
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })

  const existing = await prisma.position.findFirst({
    where: { id, userId: session.user.id },
  })
  if (!existing) return NextResponse.json({ error: '포지션 없음' }, { status: 404 })

  await prisma.position.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}
