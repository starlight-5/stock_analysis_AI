/**
 * 한국투자증권 토큰 관리 — 전역 싱글턴
 *
 * - softExp: expires_in - 60s (정상 만료 기준)
 * - hardExp: expires_in 그대로 (실제 API 만료)
 * - EGW00133 rate limit 수신 시: hardExp 내면 기존 토큰 재사용, backoff 60s 설정
 */

const KI_KEY    = process.env.KOREA_INVESTMENT_API_KEY    ?? ''
const KI_SECRET = process.env.KOREA_INVESTMENT_API_SECRET ?? ''
const KI_IS_MOCK = (process.env.KOREA_INVESTMENT_MODE ?? 'real').toLowerCase() === 'mock'

export const KI_BASE = KI_IS_MOCK
  ? 'https://openapivts.koreainvestment.com:29443'
  : 'https://openapi.koreainvestment.com:9443'

export { KI_KEY, KI_SECRET }

type KiTokenEntry = { token: string; softExp: number; hardExp: number }
const g = globalThis as unknown as {
  __kiToken:      KiTokenEntry | null
  __kiTokenFetch: Promise<string> | null
  __kiBackoff:    number
}

g.__kiToken      ??= null
g.__kiTokenFetch ??= null
g.__kiBackoff    ??= 0

export async function getKIToken(): Promise<string> {
  if (!KI_KEY || !KI_SECRET) throw new Error(
    'KOREA_INVESTMENT 키 미설정 — .env.local 에 KOREA_INVESTMENT_API_KEY / KOREA_INVESTMENT_API_SECRET 추가 필요'
  )

  const now = Date.now()

  // 1. softExp 내 → 즉시 반환
  if (g.__kiToken && now < g.__kiToken.softExp) return g.__kiToken.token

  // 2. backoff 중 → hardExp 내면 기존 토큰 재사용, 아니면 에러
  if (now < g.__kiBackoff) {
    if (g.__kiToken && now < g.__kiToken.hardExp) return g.__kiToken.token
    throw new Error('한국투자증권 토큰 rate limit — 잠시 후 다시 시도해주세요')
  }

  // 3. 발급 중인 요청이 있으면 공유
  if (g.__kiTokenFetch) return g.__kiTokenFetch

  // 4. 새 발급 요청
  const p: Promise<string> = (async () => {
    const res = await fetch(`${KI_BASE}/oauth2/tokenP`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'client_credentials', appkey: KI_KEY, appsecret: KI_SECRET }),
    })

    // EGW00133: rate limit → backoff 60s, 기존 토큰이 hardExp 내면 재사용
    if (!res.ok) {
      let body: Record<string, string> = {}
      try { body = await res.json() } catch {}
      if (body.error_code === 'EGW00133') {
        g.__kiBackoff = now + 62_000
        if (g.__kiToken && now < g.__kiToken.hardExp) return g.__kiToken.token
      }
      throw new Error(`한투 토큰 HTTP ${res.status} — ${JSON.stringify(body)}`)
    }

    const json = await res.json()
    if (!json.access_token) throw new Error(`한투 토큰 응답에 access_token 없음: ${JSON.stringify(json)}`)

    const expiresMs = (json.expires_in ?? 86400) * 1000
    g.__kiToken  = { token: json.access_token, softExp: now + expiresMs - 60_000, hardExp: now + expiresMs }
    g.__kiBackoff = 0
    return g.__kiToken.token
  })().finally(() => { g.__kiTokenFetch = null })

  g.__kiTokenFetch = p
  return p
}
