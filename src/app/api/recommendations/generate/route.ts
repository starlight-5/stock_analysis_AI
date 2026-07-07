/**
 * GET /api/recommendations/generate
 * GitHub Actions가 매일 06:00~07:55 KST 사이 5분 간격으로 자동 호출합니다
 * (.github/workflows/recommendations-generate.yml, Authorization: Bearer <CRON_SECRET>).
 * 어드민 계정으로 로그인된 상태에서 직접 호출하면 CRON_SECRET 없이도 실행됩니다.
 *
 * 이미 처리된 종목은 건너뛰고, 시간 예산 초과 시 중단했다가 다음 호출에서 이어서 처리합니다.
 * 종목 1개 분석(Gemini 호출 포함)은 이론상 최대 수십 초가 걸릴 수 있어, 고정 예산 대신
 * "지금까지 관찰된 가장 느린 처리 시간"을 기준으로 다음 종목을 시작해도 안전한지 판단합니다
 * (curl --max-time 58초 · Vercel 함수 제한 60초 대비 안전 마진 확보).
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { runStrategyAnalysis } from '@/lib/strategyAnalyzer'

const GEMINI_DELAY_MS = 4500  // Gemini 분당 요청 한도(RPM) 대비 여유 확보 (호출 간격 ~7~9초 → 분당 ~7~9회)
const YF_DELAY_MS     = 300
const HARD_DEADLINE_MS = 58_000       // curl --max-time(58초)·Vercel 함수 제한(60초) 대비 안전 마진
const FIRST_ITER_ESTIMATE_MS = 38_000 // 첫 종목 처리 전 관찰치가 없을 때 쓰는 보수적 추정치 (GEMINI_DELAY_MS 반영)
const ITER_SAFETY_FACTOR = 1.3        // 관찰된 최대 처리 시간에 곱하는 여유율
const PICK_ESTIMATE_MS = 26_000       // 섹터 종목 선정 1회의 최악치 (GEMINI_DELAY_MS 4.5초 + Gemini 병렬 호출 최대 20초 + 여유)

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

async function callGeminiForPicks(apiKey: string, market: 'us' | 'kr', sector: SectorPerf): Promise<StockPick[]> {
  const isUS = market === 'us'
  const prompt = isUS
    ? `섹터: ${sector.name} (1개월 수익률: ${sector.avgReturn1M > 0 ? '+' : ''}${sector.avgReturn1M.toFixed(1)}%)
미국 상장 종목 10개를 JSON 배열로만 출력 (마크다운 없이):
[{"ticker":"NVDA","name":"엔비디아","reason":"한줄 투자 포인트"}]
규칙: 티커 영문 대문자, 해당 섹터 관련주, ETF·소형주 제외, 정확히 10개`
    : `섹터: ${sector.name} (1개월 수익률: ${sector.avgReturn1M > 0 ? '+' : ''}${sector.avgReturn1M.toFixed(1)}%)
한국 상장 종목 10개를 JSON 배열로만 출력 (마크다운 없이):
[{"ticker":"005930","name":"삼성전자","reason":"한줄 투자 포인트"}]
규칙: ticker는 반드시 6자리 숫자 종목코드, 해당 섹터 관련주, ETF·소형주 제외, 정확히 10개`

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
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`)
  const json = await res.json()
  const raw  = (json.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]')
    .replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
  const arr  = JSON.parse(raw)
  const re   = isUS ? /^[A-Z]{1,5}$/ : /^\d{6}$/
  return (Array.isArray(arr) ? arr : [])
    .filter((s: any) => s?.ticker && re.test(s.ticker))
    .slice(0, 10)
    .map((s: any) => ({ ticker: s.ticker, name: s.name ?? s.ticker, reason: s.reason ?? '' }))
}

async function pickStocksForSector(apiKey: string, sector: SectorPerf): Promise<PickedStocks> {
  const [us, kr] = await Promise.all([
    callGeminiForPicks(apiKey, 'us', sector),
    callGeminiForPicks(apiKey, 'kr', sector),
  ])
  return { us, kr }
}

// ─── GET Handler (Vercel Cron 진입점 + 어드민 수동 실행) ──────────

export async function GET(req: NextRequest) {
  const startMs = Date.now()

  // 인증: Vercel Cron 시크릿 OR 로그인된 어드민
  const cronSecret = process.env.CRON_SECRET
  const authHeader  = req.headers.get('authorization')
  const isFromCron  = !!cronSecret && authHeader === `Bearer ${cronSecret}`

  if (!isFromCron) {
    const session    = await getServerSession(authOptions)
    const adminEmail = process.env.ADMIN_EMAIL
    if (!session?.user?.email || !adminEmail || session.user.email !== adminEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const geminiApiKey = process.env.GEMINI_API_KEY
  if (!geminiApiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY 미설정' }, { status: 500 })
  }

  const date = todayKST()
  const log: string[] = [`[${new Date().toISOString()}] 시작: ${date}`]
  const summary: Record<string, { ok: number; skip: number; fail: number }> = {}

  try {
    // 7일 이전 데이터 삭제
    const cutoff = new Date(Date.now() + 9 * 60 * 60 * 1000)
    cutoff.setDate(cutoff.getDate() - 7)
    const cutoffDate = cutoff.toISOString().slice(0, 10)
    const deleted = await prisma.dailyRecommendation.deleteMany({
      where: { date: { lt: cutoffDate } },
    })
    if (deleted.count > 0) log.push(`🗑 ${cutoffDate} 이전 데이터 ${deleted.count}건 삭제`)

    // 오늘 이미 처리된 종목 목록 로드
    const existingToday = await prisma.dailyRecommendation.findMany({
      where: { date },
      select: { ticker: true, sectorId: true },
    })
    const doneTickers   = new Set(existingToday.map(r => r.ticker))
    const doneBySecor   = existingToday.reduce<Record<string, number>>((acc, r) => {
      acc[r.sectorId] = (acc[r.sectorId] ?? 0) + 1
      return acc
    }, {})
    log.push(`기존 처리 완료: ${doneTickers.size}종목`)

    log.push('섹터 성과 조회 중...')
    const top3 = await getTop3Sectors()
    if (top3.length === 0) return NextResponse.json({ error: '섹터 데이터 없음' }, { status: 500 })
    log.push(`상위 섹터: ${top3.map(s => s.name).join(', ')}`)

    let timeExceeded = false
    let observedMaxIterMs: number | null = null  // 종목 1개 처리에 걸린 시간 중 관찰된 최댓값 (아직 없으면 null)

    for (const sector of top3) {
      if (timeExceeded) {
        log.push(`[${sector.emoji} ${sector.name}] 건너뜀 (시간 부족)`)
        break
      }

      const alreadyDone = doneBySecor[sector.id] ?? 0
      // 20 = Gemini 1회 호출분(미국 10 + 한국 10). 호출 빈도가 높아진 만큼, 딱 한 라운드만
      // 채워지면 그 뒤로는 Gemini 재호출 없이 건너뛰도록 기준을 낮게 잡는다.
      if (alreadyDone >= 20) {
        log.push(`[${sector.emoji} ${sector.name}] 완료됨 (${alreadyDone}종목)`)
        continue
      }

      // 종목별 루프와 별개로, "새 섹터 종목 선정 시도" 자체도 시간 예산을 넘길 수 있어
      // (지연 + Gemini 병렬 호출 최대 20초) 시작 전에 남은 시간을 확인한다.
      if (Date.now() - startMs + PICK_ESTIMATE_MS > HARD_DEADLINE_MS) {
        log.push(`[${sector.emoji} ${sector.name}] 건너뜀 (시간 부족 — 종목 선정 시도 안 함)`)
        timeExceeded = true
        break
      }

      log.push(`\n[${sector.emoji} ${sector.name}] 종목 선정 중... (기존 ${alreadyDone}개)`)
      summary[sector.id] = { ok: 0, skip: alreadyDone, fail: 0 }

      await sleep(GEMINI_DELAY_MS)
      let picked: PickedStocks
      try {
        picked = await pickStocksForSector(geminiApiKey, sector)
      } catch (e: any) {
        log.push(`  종목 선정 실패: ${e.message}`)
        continue
      }

      const allStocks = [
        ...picked.us.map(s => ({ ...s, market: 'US' as const })),
        ...picked.kr.map(s => ({ ...s, market: 'KR' as const })),
      ]
      const pending = allStocks.filter(s => !doneTickers.has(s.ticker))
      log.push(`  선정 ${allStocks.length}개 중 미처리 ${pending.length}개 분석 시작`)

      for (const stock of pending) {
        // FIRST_ITER_ESTIMATE_MS는 이미 보수적 최악치라 배율을 또 곱하지 않고,
        // 실제 관찰치(observedMaxIterMs)에만 여유율을 적용한다.
        const estimatedNext = observedMaxIterMs != null
          ? observedMaxIterMs * ITER_SAFETY_FACTOR
          : FIRST_ITER_ESTIMATE_MS
        if (Date.now() - startMs + estimatedNext > HARD_DEADLINE_MS) {
          log.push('  ⏸ 시간 제한 — 다음 호출에서 이어서 처리됩니다')
          timeExceeded = true
          break
        }

        const iterStart = Date.now()
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
          doneTickers.add(stock.ticker)
          summary[sector.id].ok++
          log.push(`  ✓ ${stock.ticker} (${analysis.strategy.signal})`)
        } catch (e: any) {
          summary[sector.id].fail++
          log.push(`  ✗ ${stock.ticker}: ${e.message}`)
        } finally {
          const iterMs = Date.now() - iterStart
          observedMaxIterMs = observedMaxIterMs == null ? iterMs : Math.max(observedMaxIterMs, iterMs)
        }
      }
    }

    const elapsed    = ((Date.now() - startMs) / 1000).toFixed(1)
    const totalDone  = doneTickers.size
    const isComplete = !timeExceeded
    log.push(`\n완료: ${elapsed}초 경과 · 누적 ${totalDone}종목`)

    return NextResponse.json({ date, summary, log, totalDone, isComplete, elapsed: `${elapsed}s` })
  } catch (e: any) {
    log.push(`\n오류: ${e.message}`)
    return NextResponse.json({ error: e.message, log }, { status: 500 })
  }
}
