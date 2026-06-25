import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
type DbWatchlistItem = NonNullable<Awaited<ReturnType<typeof prisma.watchlistItem.findFirst>>>

function toItem(i: DbWatchlistItem) {
  return {
    id:      i.id,
    ticker:  i.ticker,
    name:    i.name,
    addedAt: i.addedAt.toISOString(),
    memo:    i.memo ?? '',
  }
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const items = await prisma.watchlistItem.findMany({
    where: { userId: session.user.id },
    orderBy: { addedAt: 'desc' },
  })

  return NextResponse.json(items.map(toItem))
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const { ticker, name, memo } = await req.json()
  if (!ticker) return NextResponse.json({ error: 'ticker 필요' }, { status: 400 })

  try {
    const item = await prisma.watchlistItem.create({
      data: {
        userId: session.user.id,
        ticker: ticker.toUpperCase(),
        name:   name ?? ticker,
        memo:   memo ?? null,
      },
    })

    return NextResponse.json(toItem(item), { status: 201 })
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: '이미 추가된 종목' }, { status: 409 })
    }
    throw e
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const ticker = req.nextUrl.searchParams.get('ticker')
  if (!ticker) return NextResponse.json({ error: 'ticker 필요' }, { status: 400 })

  await prisma.watchlistItem.deleteMany({
    where: { userId: session.user.id, ticker: ticker.toUpperCase() },
  })

  return NextResponse.json({ ok: true })
}
