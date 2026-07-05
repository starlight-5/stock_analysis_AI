/**
 * GET /api/recommendations?date=2026-07-05
 * date 미입력 시 오늘(KST) 기준으로 조회합니다.
 * 섹터별로 그룹핑하여 반환합니다.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function todayKST(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date') ?? todayKST()

  const rows = await prisma.dailyRecommendation.findMany({
    where: { date },
    orderBy: [{ sectorId: 'asc' }, { signal: 'asc' }],
  })

  if (rows.length === 0) {
    return NextResponse.json({ date, sectors: [], empty: true })
  }

  // 섹터별 그룹핑
  const sectorMap = new Map<string, {
    sectorId: string
    sectorName: string
    sectorEmoji: string
    stocks: typeof rows
  }>()

  for (const row of rows) {
    if (!sectorMap.has(row.sectorId)) {
      sectorMap.set(row.sectorId, {
        sectorId:    row.sectorId,
        sectorName:  row.sectorName,
        sectorEmoji: row.sectorEmoji,
        stocks:      [],
      })
    }
    sectorMap.get(row.sectorId)!.stocks.push(row)
  }

  const SIGNAL_ORDER: Record<string, number> = {
    strong_buy: 0, buy: 1, watch: 2, sell: 3, strong_sell: 4,
  }

  const sectors = Array.from(sectorMap.values()).map(s => ({
    ...s,
    stocks: [...s.stocks].sort((a, b) =>
      (SIGNAL_ORDER[a.signal] ?? 9) - (SIGNAL_ORDER[b.signal] ?? 9)
    ),
  }))

  return NextResponse.json({ date, sectors, generatedAt: rows[0]?.generatedAt })
}
