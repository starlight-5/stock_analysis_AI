/**
 * 한국투자증권 토큰 관리
 *
 * Vercel은 서버리스 인스턴스가 여러 개 동시에 뜰 수 있어 globalThis만으로는
 * rate limit(EGW00133)을 막을 수 없다. DB(KisTokenCache)에 토큰을 저장해
 * 모든 인스턴스가 공유하도록 한다.
 *
 * 우선순위:
 *   1. globalThis 인메모리 캐시 (같은 인스턴스 내 재요청 → 즉시 반환)
 *   2. DB 캐시 (다른 인스턴스가 이미 발급한 토큰)
 *   3. KIS API 신규 발급
 */

import { prisma } from './prisma'

const KI_KEY     = process.env.KOREA_INVESTMENT_API_KEY    ?? ''
const KI_SECRET  = process.env.KOREA_INVESTMENT_API_SECRET ?? ''
const KI_IS_MOCK = (process.env.KOREA_INVESTMENT_MODE ?? 'real').toLowerCase() === 'mock'

export const KI_BASE = KI_IS_MOCK
  ? 'https://openapivts.koreainvestment.com:29443'
  : 'https://openapi.koreainvestment.com:9443'

export { KI_KEY, KI_SECRET }

type KiMem = { token: string; exp: number }
const g = globalThis as unknown as { __kiMem: KiMem | null; __kiFetch: Promise<string> | null }
g.__kiMem   ??= null
g.__kiFetch ??= null

export async function getKIToken(): Promise<string> {
  if (!KI_KEY || !KI_SECRET) throw new Error(
    'KOREA_INVESTMENT 키 미설정 — .env.local 에 KOREA_INVESTMENT_API_KEY / KOREA_INVESTMENT_API_SECRET 추가 필요'
  )

  const now = Date.now()

  // 1. 인메모리 캐시 (5분 여유 두고 확인)
  if (g.__kiMem && now < g.__kiMem.exp - 300_000) return g.__kiMem.token

  // 2. 같은 인스턴스 내 발급 중인 요청 공유
  if (g.__kiFetch) return g.__kiFetch

  const p: Promise<string> = (async () => {
    // 3. DB 캐시 확인 (5분 여유)
    try {
      const cached = await prisma.kisTokenCache.findUnique({ where: { id: 'kis_token' } })
      if (cached && cached.expiresAt.getTime() - now > 300_000) {
        g.__kiMem = { token: cached.token, exp: cached.expiresAt.getTime() }
        return cached.token
      }
    } catch {}

    // 4. KIS API 신규 발급
    const res = await fetch(`${KI_BASE}/oauth2/tokenP`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ grant_type: 'client_credentials', appkey: KI_KEY, appsecret: KI_SECRET }),
    })

    if (!res.ok) {
      let body: Record<string, string> = {}
      try { body = await res.json() } catch {}

      // EGW00133: rate limit → DB에 있는 토큰이라도 반환
      if (body.error_code === 'EGW00133') {
        try {
          const fallback = await prisma.kisTokenCache.findUnique({ where: { id: 'kis_token' } })
          if (fallback && fallback.expiresAt.getTime() > now) {
            g.__kiMem = { token: fallback.token, exp: fallback.expiresAt.getTime() }
            return fallback.token
          }
        } catch {}
      }

      throw new Error(`한투 토큰 HTTP ${res.status} — ${JSON.stringify(body)}`)
    }

    const json = await res.json()
    if (!json.access_token) throw new Error(`한투 토큰 응답에 access_token 없음: ${JSON.stringify(json)}`)

    const expiresAt = new Date(now + (json.expires_in ?? 86400) * 1000)

    // 5. DB에 저장 (upsert — 동시에 여러 인스턴스가 써도 무해)
    try {
      await prisma.kisTokenCache.upsert({
        where:  { id: 'kis_token' },
        update: { token: json.access_token, expiresAt },
        create: { id: 'kis_token', token: json.access_token, expiresAt },
      })
    } catch {}

    g.__kiMem = { token: json.access_token, exp: expiresAt.getTime() }
    return json.access_token
  })().finally(() => { g.__kiFetch = null })

  g.__kiFetch = p
  return p
}
