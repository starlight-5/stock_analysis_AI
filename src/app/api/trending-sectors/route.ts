/**
 * GET /api/trending-sectors
 * 대표 ETF 1개월/3개월 평균 수익률을 계산하여 가장 뜨는 섹터 3개를 선정하고,
 * Gemini AI에게 관련 미국·한국 유망 주식 및 투자 근거를 추천받아 반환하는 엔드포인트.
 * 잦은 AI API 및 ETF 데이터 요청을 방지하기 위해 3시간 인메모리 캐싱을 적용한다.
 */
import { NextResponse } from 'next/server'

// ─── 캐시 (3시간 TTL) ───────────────────────────────────────────
;(globalThis as any).__trendingCache ??= { data: null, exp: 0 }
const cache: { data: object | null; exp: number } = (globalThis as any).__trendingCache
const TTL_MS = 3 * 60 * 60 * 1000

// ─── 타입 ────────────────────────────────────────────────────────

export interface TrendingStock {
  ticker: string
  name: string
  market: 'US' | 'KR'
  reason: string
}

export interface TrendingSector {
  primaryEtf: string       // 대표 ETF (표시용)
  etfsUsed: string[]       // 평균 산출에 사용된 ETF 목록
  avgReturn1M: number      // 2개 ETF 평균 수익률 (1개월)
  avgReturn3M: number
  sectorName: string
  sectorEmoji: string
  hotness: 'hot' | 'rising' | 'cooling'
  description: string
  stocks: TrendingStock[]
}

export interface YearTheme {
  year: number
  sector: string
  active: boolean
}

export interface TrendingSectorsData {
  updatedAt: string
  geminiUsed: boolean      // false면 종목이 정적 데이터임을 UI에서 표시
  sectors: TrendingSector[]
  yearTimeline: YearTheme[]
}

// ─── 섹터 그룹 정의 ──────────────────────────────────────────────
// 각 섹터당 비레버리지 표준 ETF 2개를 사용해 평균 수익률을 계산.
// 단일 ETF 대비 특이값(분배금·추적 오류) 영향을 줄일 수 있음.
// 레버리지 ETF(SOXL·TECL·DFEN 등) 절대 추가 금지 — 수익률 왜곡.

const SECTOR_GROUPS = [
  { id: 'semiconductor', name: '반도체',        emoji: '💾', etfs: ['SOXX', 'SMH']   },
  { id: 'tech',          name: 'IT·테크',        emoji: '💻', etfs: ['XLK',  'QQQ']   },
  { id: 'ai',            name: 'AI·혁신',        emoji: '🤖', etfs: ['ARKK', 'AIQ']   },
  { id: 'biotech',       name: '바이오·헬스',    emoji: '🧬', etfs: ['IBB',  'XBI']   },
  { id: 'energy',        name: '에너지',         emoji: '⚡', etfs: ['XLE',  'XOP']   },
  { id: 'cleanenergy',   name: '클린에너지',     emoji: '🌱', etfs: ['ICLN', 'QCLN']  },
  { id: 'defense',       name: '방산·항공',      emoji: '🛡️', etfs: ['ITA',  'XAR']  },
  { id: 'robotics',      name: '로봇·자동화',    emoji: '🦾', etfs: ['ROBO', 'BOTZ']  },
  { id: 'ev',            name: '전기차·배터리',  emoji: '🚗', etfs: ['DRIV', 'LIT']   },
] as const

// ─── 섹터별 정적 종목 (Gemini 실패 시 폴백) ─────────────────────
// Gemini 정상 작동 시에는 이 데이터를 사용하지 않음.

const FALLBACK_STOCKS: Record<string, TrendingStock[]> = {
  semiconductor: [
    { ticker: 'NVDA',   name: '엔비디아',         market: 'US', reason: 'AI GPU 수요 주도' },
    { ticker: 'AMD',    name: 'AMD',              market: 'US', reason: '데이터센터 CPU·GPU' },
    { ticker: 'AVGO',   name: 'Broadcom',         market: 'US', reason: 'AI 네트워킹 칩·ASIC' },
    { ticker: '005930', name: '삼성전자',          market: 'KR', reason: 'HBM·파운드리 수혜' },
    { ticker: '000660', name: 'SK하이닉스',        market: 'KR', reason: 'HBM 점유율 1위' },
  ],
  tech: [
    { ticker: 'MSFT',   name: '마이크로소프트',   market: 'US', reason: 'Azure AI·클라우드' },
    { ticker: 'AAPL',   name: '애플',             market: 'US', reason: 'Apple Intelligence' },
    { ticker: 'GOOGL',  name: '알파벳',           market: 'US', reason: 'Gemini AI·광고' },
    { ticker: '035420', name: 'NAVER',            market: 'KR', reason: 'HyperCLOVA AI' },
    { ticker: '035720', name: '카카오',           market: 'KR', reason: 'AI·클라우드 사업' },
  ],
  ai: [
    { ticker: 'TSLA',   name: '테슬라',           market: 'US', reason: 'FSD 자율주행 상용화' },
    { ticker: 'PLTR',   name: 'Palantir',         market: 'US', reason: 'AI 플랫폼 AIP 확장' },
    { ticker: 'COIN',   name: 'Coinbase',         market: 'US', reason: '가상자산 제도화 수혜' },
    { ticker: '263750', name: '펄어비스',         market: 'KR', reason: 'AI 게임엔진 개발' },
  ],
  biotech: [
    { ticker: 'LLY',    name: '일라이릴리',       market: 'US', reason: '비만치료제 Zepbound' },
    { ticker: 'NVO',    name: '노보노디스크',     market: 'US', reason: 'Ozempic GLP-1 지배력' },
    { ticker: 'REGN',   name: 'Regeneron',        market: 'US', reason: '항체치료제 블록버스터' },
    { ticker: '207940', name: '삼성바이오로직스', market: 'KR', reason: 'CDMO 수주 급증' },
    { ticker: '068270', name: '셀트리온',         market: 'KR', reason: '바이오시밀러 글로벌 확장' },
  ],
  energy: [
    { ticker: 'XOM',    name: '엑손모빌',         market: 'US', reason: '유가 상승·정제마진' },
    { ticker: 'CVX',    name: '셰브런',           market: 'US', reason: '배당 성장·자사주' },
    { ticker: 'COP',    name: 'ConocoPhillips',  market: 'US', reason: '셰일 생산 원가 경쟁력' },
    { ticker: '096770', name: 'SK이노베이션',     market: 'KR', reason: '배터리·정유 복합 성장' },
  ],
  cleanenergy: [
    { ticker: 'NEE',    name: 'NextEra Energy',  market: 'US', reason: '미국 최대 태양·풍력' },
    { ticker: 'ENPH',   name: 'Enphase',         market: 'US', reason: '마이크로인버터 점유율 1위' },
    { ticker: 'SEDG',   name: 'SolarEdge',       market: 'US', reason: '유럽 태양광 수혜' },
    { ticker: '009830', name: '한화솔루션',       market: 'KR', reason: '태양광 모듈 글로벌 확대' },
  ],
  defense: [
    { ticker: 'LMT',    name: '록히드마틴',       market: 'US', reason: 'F-35·미사일 수요' },
    { ticker: 'RTX',    name: 'RTX',             market: 'US', reason: '방산 수주·엔진 MRO' },
    { ticker: 'NOC',    name: 'Northrop',        market: 'US', reason: 'B-21·우주사업' },
    { ticker: '012450', name: '한화에어로스페이스', market: 'KR', reason: 'K9·천무 수출 급증' },
    { ticker: '047810', name: '한국항공우주',     market: 'KR', reason: '항공·방산 수출 호조' },
  ],
  robotics: [
    { ticker: 'ISRG',   name: 'Intuitive Surgical', market: 'US', reason: '수술 로봇 다빈치 독점' },
    { ticker: 'ABB',    name: 'ABB',             market: 'US', reason: '산업용 로봇·자동화 선두' },
    { ticker: 'NVDA',   name: '엔비디아',         market: 'US', reason: 'AI 로보틱스 Isaac 플랫폼' },
    { ticker: '064350', name: '현대로보틱스',     market: 'KR', reason: '스마트팩토리 수요 급증' },
  ],
  ev: [
    { ticker: 'TSLA',   name: '테슬라',           market: 'US', reason: 'FSD·에너지 사업 확장' },
    { ticker: 'UBER',   name: '우버',             market: 'US', reason: '자율주행 택시 파트너십' },
    { ticker: 'APTV',   name: 'Aptiv',           market: 'US', reason: '전장 소프트웨어 플랫폼' },
    { ticker: '005380', name: '현대차',           market: 'KR', reason: '아이오닉·SDV 전환 가속' },
    { ticker: '051910', name: 'LG화학',           market: 'KR', reason: '배터리 소재 글로벌 확대' },
  ],
}

// ─── ETF 수익률 조회 ─────────────────────────────────────────────

async function fetchETFReturn(ticker: string): Promise<{ return1M: number; return3M: number }> {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=3mo`,
    {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(8000),
    }
  )
  if (!res.ok) throw new Error(`${ticker} HTTP ${res.status}`)
  const json = await res.json()
  const closes = json.chart?.result?.[0]?.indicators?.quote?.[0]?.close as (number | null)[] | undefined

  if (!closes || closes.length < 5) throw new Error(`${ticker} 데이터 부족`)
  const valid = closes.filter((c): c is number => c != null && isFinite(c))
  if (valid.length < 5) throw new Error(`${ticker} 유효 데이터 부족`)

  const cur   = valid[valid.length - 1]
  const ago1M = valid[Math.max(0, valid.length - 22)]
  const ago3M = valid[0]

  return {
    return1M: ((cur / ago1M) - 1) * 100,
    return3M: ((cur / ago3M) - 1) * 100,
  }
}

// ─── 섹터 성과 집계 (ETF 2개 평균) ──────────────────────────────

interface SectorPerf {
  id: string
  name: string
  emoji: string
  primaryEtf: string
  etfsUsed: string[]
  avgReturn1M: number
  avgReturn3M: number
}

async function calcSectorPerfs(): Promise<SectorPerf[]> {
  const results = await Promise.allSettled(
    SECTOR_GROUPS.flatMap(g => g.etfs.map(ticker =>
      fetchETFReturn(ticker).then(r => ({ groupId: g.id, ticker, ...r }))
    ))
  )

  const byGroup: Record<string, { ticker: string; return1M: number; return3M: number }[]> = {}
  for (const r of results) {
    if (r.status === 'fulfilled') {
      const { groupId, ticker, return1M, return3M } = r.value
      ;(byGroup[groupId] ??= []).push({ ticker, return1M, return3M })
    }
  }

  const output: SectorPerf[] = []
  for (const g of SECTOR_GROUPS) {
    const perfs = byGroup[g.id] ?? []
    if (perfs.length === 0) continue
    output.push({
      id:          g.id,
      name:        g.name,
      emoji:       g.emoji,
      primaryEtf:  g.etfs[0],
      etfsUsed:    perfs.map(p => p.ticker),
      avgReturn1M: perfs.reduce((s, p) => s + p.return1M, 0) / perfs.length,
      avgReturn3M: perfs.reduce((s, p) => s + p.return3M, 0) / perfs.length,
    })
  }
  return output
}

// ─── Gemini로 섹터 설명 + 종목 추천 ─────────────────────────────

async function fetchGeminiSectors(
  apiKey: string,
  top3: SectorPerf[]
): Promise<TrendingSectorsData> {
  const today = new Date()
  const dateStr = today.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
  const currentYear = today.getFullYear()

  const etfLines = top3.map(s =>
    `- ${s.name} (${s.etfsUsed.join('·')} 평균): 1개월 ${s.avgReturn1M > 0 ? '+' : ''}${s.avgReturn1M.toFixed(1)}%, 3개월 ${s.avgReturn3M > 0 ? '+' : ''}${s.avgReturn3M.toFixed(1)}%`
  ).join('\n')

  const prompt = `오늘은 ${dateStr}입니다.
아래는 비레버리지 ETF 2개 평균으로 계산한 섹터 성과 데이터입니다:

${etfLines}

위 섹터에 대해 다음 JSON을 생성하세요. 순수 JSON만 출력 (마크다운 코드블록 없이):
{
  "sectors": [
    {
      "sectorName": "섹터 한국어 이름",
      "hotness": "hot | rising | cooling",
      "description": "왜 지금 이 섹터가 주목받는지 최신 트렌드 기반 1-2문장 (한국어)",
      "stocks": [
        {"ticker": "종목코드", "name": "종목명", "market": "US 또는 KR", "reason": "한줄 투자 포인트"}
      ]
    }
  ],
  "yearTimeline": [
    {"year": ${currentYear - 2}, "sector": "그 해 글로벌 시장 주도 투자 테마 (한국어 2-4단어)", "active": false},
    {"year": ${currentYear - 1}, "sector": "그 해 글로벌 시장 주도 투자 테마 (한국어 2-4단어)", "active": false},
    {"year": ${currentYear},     "sector": "올해 현재 가장 핫한 투자 테마 (한국어 2-4단어)", "active": true}
  ]
}

규칙:
- sectors 배열: 입력 순서 그대로 ${top3.length}개
- 각 섹터당 미국 주식 3종목 + 한국 관련주 1-2종목 (없으면 US만)
- 한국 종목(market=KR)의 ticker는 반드시 6자리 숫자 종목코드 사용 (예: "005930", "000660"). ETF 이름이나 한글 이름 절대 금지.
- hotness: 1개월 평균 +8% 이상=hot, +3~8%=rising, 그 미만=cooling
- description은 최신 뉴스·실적·정책 기반으로 구체적으로 작성
- yearTimeline은 실제 글로벌 시장에서 주도한 투자 테마를 정확히 반영`

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 2048 },
      }),
      signal: AbortSignal.timeout(20000),
    }
  )
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`)
  const json = await res.json()
  const raw = json.candidates?.[0]?.content?.parts?.[0]?.text
  if (!raw) throw new Error('Gemini 응답 없음')

  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
  const parsed = JSON.parse(cleaned)

  const sectors: TrendingSector[] = (parsed.sectors ?? []).map((s: any, i: number) => {
    const perf = top3[i]
    return {
      primaryEtf:  perf.primaryEtf,
      etfsUsed:    perf.etfsUsed,
      avgReturn1M: perf.avgReturn1M,
      avgReturn3M: perf.avgReturn3M,
      sectorName:  s.sectorName ?? perf.name,
      sectorEmoji: perf.emoji,
      hotness:     s.hotness ?? 'rising',
      description: s.description ?? '',
      stocks: (s.stocks ?? [])
        .map((st: any) => ({
          ticker: st.ticker ?? '',
          name:   st.name ?? st.ticker ?? '',
          market: st.market === 'KR' ? 'KR' : 'US',
          reason: st.reason ?? '',
        }))
        .filter((st: any) => {
          if (/[가-힣]/.test(st.ticker)) return false   // 한글 포함 ticker 전부 제거
          if (st.market === 'KR') return /^\d{6}$/.test(st.ticker)
          return st.ticker.length > 0
        }),
    }
  })

  return {
    updatedAt: new Date().toISOString(),
    geminiUsed: true,
    sectors,
    yearTimeline: parsed.yearTimeline ?? [],
  }
}

// ─── 폴백 (Gemini 실패 시) ───────────────────────────────────────

function buildFallback(top3: SectorPerf[]): TrendingSectorsData {
  const currentYear = new Date().getFullYear()
  const sectors: TrendingSector[] = top3.map((s, i) => ({
    primaryEtf:  s.primaryEtf,
    etfsUsed:    s.etfsUsed,
    avgReturn1M: s.avgReturn1M,
    avgReturn3M: s.avgReturn3M,
    sectorName:  s.name,
    sectorEmoji: s.emoji,
    hotness:     i === 0 ? 'hot' : 'rising',
    description: `${s.name} 섹터가 최근 1개월 ${s.avgReturn1M > 0 ? '+' : ''}${s.avgReturn1M.toFixed(1)}%의 성과를 기록 중입니다 (${s.etfsUsed.join('·')} 평균 기준).`,
    stocks: FALLBACK_STOCKS[s.id] ?? [],
  }))

  return {
    updatedAt: new Date().toISOString(),
    geminiUsed: false,
    sectors,
    yearTimeline: [
      { year: currentYear - 2, sector: 'AI·그래픽',    active: false },
      { year: currentYear - 1, sector: '반도체·양자컴', active: false },
      { year: currentYear,     sector: sectors[0]?.sectorName ?? '반도체', active: true },
    ],
  }
}

// ─── GET Handler ─────────────────────────────────────────────────

export async function GET() {
  if (cache.data && Date.now() < cache.exp) {
    return NextResponse.json({ ...cache.data, fromCache: true })
  }

  const sectorPerfs = await calcSectorPerfs()

  if (sectorPerfs.length < 3) {
    const fallbackGroups = SECTOR_GROUPS.slice(0, 3).map(g => ({
      id: g.id, name: g.name, emoji: g.emoji,
      primaryEtf: g.etfs[0], etfsUsed: [g.etfs[0]],
      avgReturn1M: 0, avgReturn3M: 0,
    }))
    return NextResponse.json(buildFallback(fallbackGroups))
  }

  const top3 = [...sectorPerfs].sort((a, b) => b.avgReturn1M - a.avgReturn1M).slice(0, 3)

  const geminiApiKey = process.env.GEMINI_API_KEY
  let data: TrendingSectorsData

  if (geminiApiKey) {
    try {
      data = await fetchGeminiSectors(geminiApiKey, top3)
    } catch (e) {
      console.warn('[trending-sectors] Gemini 실패, 폴백 사용:', (e as Error).message)
      data = buildFallback(top3)
    }
  } else {
    data = buildFallback(top3)
  }

  cache.data = data
  cache.exp  = Date.now() + TTL_MS
  return NextResponse.json(data)
}
