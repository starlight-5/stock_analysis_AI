import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import type { Position } from '@/types/stock'

const DB_PATH = path.join(process.cwd(), 'data', 'positions.json')

async function readDB(): Promise<Position[]> {
  try { return JSON.parse(await fs.readFile(DB_PATH, 'utf-8')) } catch { return [] }
}
async function writeDB(items: Position[]) {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true })
  await fs.writeFile(DB_PATH, JSON.stringify(items, null, 2))
}

export async function GET() {
  return NextResponse.json(await readDB())
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { ticker, name, strategy } = body
  if (!ticker || !strategy) return NextResponse.json({ error: '필수 필드 누락' }, { status: 400 })

  const positions = await readDB()

  const newPos: Position = {
    id: `${Date.now()}`,
    ticker: ticker.toUpperCase(),
    name: name ?? ticker.toUpperCase(),
    registeredAt: new Date().toISOString(),
    signal:       strategy.signal,
    summary:      strategy.summary,
    entryType:    strategy.buyStrategy.type,
    entries:      strategy.buyStrategy.entries,
    stopLoss:     strategy.buyStrategy.stopLoss,
    stopLossReason: strategy.buyStrategy.stopLossReason,
    targets:      strategy.sellStrategy.targets,
    risks:        strategy.risks,
    status:       'active',
  }

  positions.push(newPos)
  await writeDB(positions)
  return NextResponse.json(newPos, { status: 201 })
}

// 포지션 최신화 (기존 active 포지션에 새 전략 덮어쓰기)
export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, strategy } = body
  if (!id || !strategy) return NextResponse.json({ error: '필수 필드 누락' }, { status: 400 })

  const positions = await readDB()
  const idx = positions.findIndex(p => p.id === id && p.status === 'active')
  if (idx === -1) return NextResponse.json({ error: '활성 포지션 없음' }, { status: 404 })

  positions[idx] = {
    ...positions[idx],
    registeredAt:   new Date().toISOString(),
    signal:         strategy.signal,
    summary:        strategy.summary,
    entryType:      strategy.buyStrategy.type,
    entries:        strategy.buyStrategy.entries,
    stopLoss:       strategy.buyStrategy.stopLoss,
    stopLossReason: strategy.buyStrategy.stopLossReason,
    targets:        strategy.sellStrategy.targets,
    risks:          strategy.risks,
  }

  await writeDB(positions)
  return NextResponse.json(positions[idx])
}

// 포지션 종료 (논리 삭제)
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })

  const positions = await readDB()
  const updated = positions.map(p =>
    p.id === id ? { ...p, status: 'closed' as const, closedAt: new Date().toISOString() } : p
  )
  await writeDB(updated)
  return NextResponse.json({ ok: true })
}
