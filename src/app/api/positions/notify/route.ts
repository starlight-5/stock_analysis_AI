/**
 * GET /api/positions/notify
 * 등록된 전체 활성 포지션을 대상으로 일일 가격 리포트를 작성하여 Discord 채널에 웹훅으로 전송하는 엔드포인트.
 * Vercel Cron 등과 연동하여 주기적 배치 작업으로 호출된다.
 */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { Position } from '@/types/stock'

const WEBHOOK_URL  = process.env.DISCORD_WEBHOOK_URL ?? ''

const IS_KR = (t: string) => /^\d{6}$/.test(t)
const fmtPrice = (ticker: string, p: number) =>
  IS_KR(ticker)
    ? `${p.toLocaleString('ko-KR')}원`
    : `$${p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function diffPct(current: number, target: number): number {
  return ((target - current) / current) * 100
}

async function fetchPrice(ticker: string): Promise<number | null> {
  const symbol = IS_KR(ticker) ? `${ticker}.KS` : ticker
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }
    )
    const json  = await res.json()
    const meta  = json.chart?.result?.[0]?.meta
    return meta?.regularMarketPrice ?? meta?.previousClose ?? null
  } catch {
    return null
  }
}

const SIGNAL_LABEL: Record<string, string> = {
  strong_buy: '강력매수', buy: '매수', watch: '관망', sell: '매도', strong_sell: '강력매도',
}
const SIGNAL_EMOJI: Record<string, string> = {
  strong_buy: '🟢', buy: '🟢', watch: '🟡', sell: '🔴', strong_sell: '🔴',
}

// GET /api/positions/notify  →  Discord 웹훅 전송
export async function GET() {
  if (!WEBHOOK_URL) {
    return NextResponse.json(
      { error: 'DISCORD_WEBHOOK_URL 미설정 — .env.local에 추가하세요' },
      { status: 500 }
    )
  }

  // DB에서 활성화 상태인 모든 포지션을 가져옴
  const rows = await prisma.position.findMany({
    where: { status: 'active' },
  })

  const active: Position[] = rows.map((row) => ({
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
  }))

  if (!active.length) {
    return NextResponse.json({ ok: true, sent: false, reason: '활성 포지션 없음' })
  }

  // 현재가 병렬 조회
  const priceMap: Record<string, number | null> = Object.fromEntries(
    await Promise.all(active.map(async p => [p.ticker, await fetchPrice(p.ticker)]))
  )

  const today = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  })

  const lines: string[] = [`📊 **포지션 일일 리포트** | ${today}\n`]

  for (const pos of active) {
    const cur = priceMap[pos.ticker]
    const em  = SIGNAL_EMOJI[pos.signal] ?? '⚪'
    const sig = SIGNAL_LABEL[pos.signal] ?? pos.signal

    lines.push(`${em} **${pos.ticker}** · ${pos.name}  \`${sig}\``)

    if (cur == null) {
      lines.push('  ⚠️ 현재가 조회 실패')
    } else {
      // 현재가 + 진입가 대비 수익률 한 줄로
      const avgEntry = pos.entries.reduce((sum, e) => sum + e.price * (e.ratio / 100), 0)
      if (avgEntry > 0) {
        const ret = diffPct(avgEntry, cur)
        const retStr = ret >= 0 ? `+${ret.toFixed(1)}%` : `${ret.toFixed(1)}%`
        const retEmoji = ret >= 0 ? '📈' : '📉'
        lines.push(`  💰 현재 **${fmtPrice(pos.ticker, cur)}**  /  진입 ${fmtPrice(pos.ticker, avgEntry)} → ${retEmoji} **${retStr}**`)
      } else {
        lines.push(`  💰 현재 **${fmtPrice(pos.ticker, cur)}**`)
      }

      // 목표가
      for (let i = 0; i < pos.targets.length; i++) {
        const t    = pos.targets[i]
        const diff = diffPct(cur, t.price)
        if (diff >= 0) {
          lines.push(`  🎯 ${i + 1}차 목표 ${fmtPrice(pos.ticker, t.price)} → **+${diff.toFixed(1)}%**`)
        } else {
          lines.push(`  ✅ ${i + 1}차 목표 ${fmtPrice(pos.ticker, t.price)} → 초과달성 (${diff.toFixed(1)}%)`)
        }
      }

      // 손절선
      const slDiff = diffPct(cur, pos.stopLoss)
      lines.push(`  🛑 손절선 ${fmtPrice(pos.ticker, pos.stopLoss)} → **${slDiff.toFixed(1)}%**`)
    }

    lines.push('')
  }

  lines.push(`_포지션 ${active.length}개 | Next.js 주식 앱_`)

  const content = lines.join('\n')

  const res = await fetch(WEBHOOK_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ content }),
  })

  if (!res.ok) {
    return NextResponse.json(
      { error: `Discord 전송 실패 HTTP ${res.status}` },
      { status: 502 }
    )
  }

  return NextResponse.json({ ok: true, sent: true, positions: active.length })
}
