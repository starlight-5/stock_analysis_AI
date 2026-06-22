import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import type { WatchlistItem } from '@/types/stock'

// 실제 서비스에서는 Prisma + PostgreSQL 등으로 교체
const DB_PATH = path.join(process.cwd(), 'data', 'watchlist.json')

async function readDB(): Promise<WatchlistItem[]> {
  try {
    const raw = await fs.readFile(DB_PATH, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return []
  }
}

async function writeDB(items: WatchlistItem[]) {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true })
  await fs.writeFile(DB_PATH, JSON.stringify(items, null, 2))
}

export async function GET() {
  const items = await readDB()
  return NextResponse.json(items)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { ticker, name, memo } = body

  if (!ticker) return NextResponse.json({ error: 'ticker 필요' }, { status: 400 })

  const items = await readDB()
  if (items.find((i) => i.ticker === ticker.toUpperCase())) {
    return NextResponse.json({ error: '이미 추가된 종목' }, { status: 409 })
  }

  const newItem: WatchlistItem = {
    id: `${Date.now()}`,
    ticker: ticker.toUpperCase(),
    name: name ?? ticker,
    addedAt: new Date().toISOString(),
    memo: memo ?? '',
  }

  items.push(newItem)
  await writeDB(items)

  return NextResponse.json(newItem, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get('ticker')
  if (!ticker) return NextResponse.json({ error: 'ticker 필요' }, { status: 400 })

  const items = await readDB()
  const filtered = items.filter((i) => i.ticker !== ticker.toUpperCase())
  await writeDB(filtered)

  return NextResponse.json({ ok: true })
}
