/**
 * GET /api/recommendations/generate
 * Vercel Cron에 의해 매일 06:00 KST (21:00 UTC)에 자동 호출됩니다.
 * Vercel이 자동으로 Authorization: Bearer <CRON_SECRET> 헤더를 추가합니다.
 *
 * 흐름:
 * 1. 상위 3개 섹터 ETF 성과 조회
 * 2. 각 섹터에서 Gemini로 US 20 + KR 20 종목 선정
 * 3. 각 종목 전략 분석 (Gemini, 2.5s 딜레이)
 * 4. DailyRecommendation DB 저장
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { runStrategyAnalysis } from '@/lib/strategyAnalyzer'

const GEMINI_DELAY_MS = 2500
const YF_DELAY_MS     = 300

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function todayKST(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
}

// ─── 섹터 ETF 성과 조회 ───────────────────────────────────────────

const SECTOR_GROUPS = [
  { id: 'semiconductor', name: '반도체',       emoji: '💾', etfs: ['SOXX', 'SMH']  },
  { id: 'tech',          name: 'IT·테크',       emoji: '💻', etfs: ['XLK',  'QQQ']  },
  { id: 'ai',            name: 'AI·혁신',       emoji: '🤖', etfs: ['ARKK', 'AIQ']  },
  { id: 'biotech',       name: '바이오·헬스',   emoji: '🧬', etfs: ['IBB',  'XBI']  },
  { id: 'energy',        name: '에너지',        emoji: '⚡', etfs: ['XLE',  'XOP']  },
  { id: 'cleanenergy',   name: '클린에너지',    emoji: '🌱', etfs: ['ICLN', 'QCLN'] },
  { id: 'defense',       name: '방산·항공',     emoji: '🛡️', etfs: ['ITA',  'XAR'] },
  { id: 'robotics',      name: '로봇·자동화',   emoji: '🦾', etfs: ['ROBO', 'BOTZ'] },
  { id: 'ev',            name: '전기차·배터리', emoji: '🚗', etfs: ['DRIV', 'LIT']  },
] as const

interface SectorPerf {
  id: string; name: string; emoji: string; avgReturn1M: number
}

async function fetchETFReturn1M(ticker: string): Promise<number> {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1mo`,
    { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }
  )
  if (!res.ok) throw new Error(`${ticker} HTTP ${res.status}`)
  const json = await res.json()
  const closes = json.chart?.result?.[0]?.indicators?.quote?.[0]?.close as (number | null)[] | undefined
  if (!closes || closes.length < 5) throw new Error(`${ticker} 데이터 부족`)
  const valid = closes.filter((c): c is number => c != null && isFinite(c))
  if (valid.length < 5) throw new Error(`${ticker} 유효 데이터 부족`)
  return ((valid[valid.length - 1] / valid[0]) - 1) * 100
}

async function getTop3Sectors(): Promise<SectorPerf[]> {
  const results = await Promise.allSettled(
    SECTOR_GROUPS.flatMap(g => g.etfs.map(t =>
      fetchETFReturn1M(t).then(r => ({ id: g.id, name: g.name, emoji: g.emoji, ret: r }))
    ))
  )
  const byGroup: Record<string, number[]> = {}
  for (const r of results) {
    if (r.status === 'fulfilled') {
      ;(byGroup[r.value.id] ??= []).push(r.value.ret)
    }
  }
  return SECTOR_GROUPS
    .filter(g => byGroup[g.id]?.length)
    .map(g => ({
      id: g.id, name: g.name, emoji: g.emoji,
      avgReturn1M: byGroup[g.id].reduce((s, v) => s + v, 0) / byGroup[g.id].length,
    }))
    .sort((a, b) => b.avgReturn1M - a.avgReturn1M)
    .slice(0, 3)
}

// ─── Gemini로 섹터별 종목 선정 ────────────────────────────────────

interface StockPick { ticker: string; name: string; reason: string }
interface PickedStocks { us: StockPick[]; kr: StockPick[] }

async function pickStocksForSector(apiKey: string, sector: SectorPerf): Promise<PickedStocks> {
  const prompt = `섹터: ${sector.name} (1개월 수익률: ${sector.avgReturn1M > 0 ? '+' : ''}${sector.avgReturn1M.toFixed(1)}%)

이 섹터에서 현재 가장 유망한 종목을 선정하세요.
순수 JSON만 출력 (마크다운 없이):
{
  "us": [{"ticker": "NVDA", "name": "엔비디아", "reason": "한줄 투자 포인트"}],
  "kr": [{"ticker": "005930", "name": "삼성전자", "reason": "한줄 투자 포인트"}]
}

규칙:
- us: 정확히 20개, 미국 상장 종목, 티커는 영문 대문자 (예: NVDA, AAPL)
- kr: 정확히 20개, 한국 상장 종목, ticker는 반드시 6자리 숫자 종목코드 (예: 005930, 000660). 한글명·ETF명 절대 금지
- 해당 섹터와 직접 관련된 종목 우선, 블루칩·고성장주 혼합
- 상장폐지·소형주·ETF 제외`

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.3, maxOutputTokens: 1024 },
      }),
      signal: AbortSignal.timeout(20000),
    }
  )
  if (!res.ok) throw new Error(`Gemini pickStocks HTTP ${res.status}`)
  const json = await res.json()
  const raw = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
  const parsed = JSON.parse(raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim())

  return {
    us: (Array.isArray(parsed.us) ? parsed.us : [])
      .filter((s: any) => s?.ticker && /^[A-Z]{1,5}$/.test(s.ticker))
      .slice(0, 20)
      .map((s: any) => ({ ticker: s.ticker, name: s.name ?? s.ticker, reason: s.reason ?? '' })),
    kr: (Array.isArray(parsed.kr) ? parsed.kr : [])
      .filter((s: any) => s?.ticker && /^\d{6}$/.test(s.ticker))
      .slice(0, 20)
      .map((s: any) => ({ ticker: s.ticker, name: s.name ?? s.ticker, reason: s.reason ?? '' })),
  }
}

// ─── GET Handler (Vercel Cron 진입점) ────────────────────────────

export async function GET(req: NextRequest) {
  // Vercel Cron 인증 (Authorization: Bearer <CRON_SECRET>)
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const geminiApiKey = process.env.GEMINI_API_KEY
  if (!geminiApiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY 미설정' }, { status: 500 })
  }

  const date = todayKST()
  const log: string[] = [`[${new Date().toISOString()}] 시작: ${date}`]
  const summary: Record<string, { ok: number; fail: number }> = {}

  try {
    log.push('섹터 성과 조회 중...')
    const top3 = await getTop3Sectors()
    if (top3.length === 0) return NextResponse.json({ error: '섹터 데이터 없음' }, { status: 500 })
    log.push(`상위 섹터: ${top3.map(s => s.name).join(', ')}`)

    for (const sector of top3) {
      log.push(`\n[${sector.emoji} ${sector.name}] 종목 선정 중...`)
      summary[sector.id] = { ok: 0, fail: 0 }

      await sleep(GEMINI_DELAY_MS)
      let picked: PickedStocks
      try {
        picked = await pickStocksForSector(geminiApiKey, sector)
      } catch (e: any) {
        log.push(`  종목 선정 실패: ${e.message}`)
        continue
      }
      log.push(`  선정: US ${picked.us.length}개 + KR ${picked.kr.length}개`)

      const stocks = [
        ...picked.us.map(s => ({ ...s, market: 'US' as const })),
        ...picked.kr.map(s => ({ ...s, market: 'KR' as const })),
      ]

      for (const stock of stocks) {
        try {
          await sleep(YF_DELAY_MS)
          const analysis = await runStrategyAnalysis(stock.ticker, geminiApiKey)
          await sleep(GEMINI_DELAY_MS)

          await prisma.dailyRecommendation.upsert({
            where:  { date_ticker: { date, ticker: stock.ticker } },
            update: {
              sectorId: sector.id, sectorName: sector.name, sectorEmoji: sector.emoji,
              name: stock.name, market: stock.market, reason: stock.reason,
              strategy: analysis.strategy as any, snapshot: analysis.snapshot as any,
              signal: analysis.strategy.signal, fallback: analysis.fallbackMode,
              generatedAt: new Date(),
            },
            create: {
              date,
              sectorId: sector.id, sectorName: sector.name, sectorEmoji: sector.emoji,
              ticker: stock.ticker, name: stock.name, market: stock.market, reason: stock.reason,
              strategy: analysis.strategy as any, snapshot: analysis.snapshot as any,
              signal: analysis.strategy.signal, fallback: analysis.fallbackMode,
            },
          })
          summary[sector.id].ok++
          log.push(`  ✓ ${stock.ticker} (${analysis.strategy.signal})`)
        } catch (e: any) {
          summary[sector.id].fail++
          log.push(`  ✗ ${stock.ticker}: ${e.message}`)
        }
      }
    }

    log.push(`\n완료: ${new Date().toISOString()}`)
    return NextResponse.json({ date, summary, log })
  } catch (e: any) {
    log.push(`\n오류: ${e.message}`)
    return NextResponse.json({ error: e.message, log }, { status: 500 })
  }
}
