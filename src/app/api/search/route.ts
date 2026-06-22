import { NextRequest, NextResponse } from 'next/server'

export type SearchResult = {
  symbol:   string
  name:     string
  exchange: string
  type:     string
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 1) return NextResponse.json([])

  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/search` +
      `?q=${encodeURIComponent(q)}&lang=en-US&region=US` +
      `&quotesCount=10&newsCount=0&enableFuzzyQuery=false`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(5000),
      }
    )
    if (!res.ok) throw new Error(`Yahoo Finance HTTP ${res.status}`)
    const json   = await res.json()
    const quotes: any[] = json.quotes ?? []

    const results: SearchResult[] = quotes
      .filter((q: any) => q.symbol && (q.shortname || q.longname))
      .slice(0, 8)
      .map((q: any) => ({
        symbol:   q.symbol,
        name:     q.shortname ?? q.longname ?? q.symbol,
        exchange: q.exchDisp  ?? q.exchange ?? '',
        type:     q.quoteType ?? '',
      }))

    return NextResponse.json(results)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 })
  }
}
