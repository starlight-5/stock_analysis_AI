/**
 * 한국투자증권 토큰 관리 — 전역 싱글턴
 *
 * dataSource.ts / rankings/route.ts 양쪽에서 import해 사용.
 * globalThis에 저장하므로:
 *   - Next.js 핫 리로드 후에도 토큰이 유지됨 (EGW00133 rate limit 방지)
 *   - 동시 요청이 여러 개 와도 promise를 공유해 실제 HTTP 요청은 1회만 발생
 */

const KI_KEY    = process.env.KOREA_INVESTMENT_API_KEY    ?? ''
const KI_SECRET = process.env.KOREA_INVESTMENT_API_SECRET ?? ''
const KI_IS_MOCK = (process.env.KOREA_INVESTMENT_MODE ?? 'real').toLowerCase() === 'mock'

export const KI_BASE = KI_IS_MOCK
  ? 'https://openapivts.koreainvestment.com:29443'
  : 'https://openapi.koreainvestment.com:9443'

export { KI_KEY, KI_SECRET }

// 캐싱된 토큰 (globalThis → 핫 리로드 무관하게 프로세스 수명 동안 유지)
;(globalThis as any).__kiToken      ??= null  // { token: string; exp: number } | null
// 진행 중인 발급 요청 (동시 요청 시 동일 promise 반환 → HTTP 요청 1회 보장)
;(globalThis as any).__kiTokenFetch ??= null  // Promise<string> | null

export async function getKIToken(): Promise<string> {
  if (!KI_KEY || !KI_SECRET) throw new Error(
    'KOREA_INVESTMENT 키 미설정 — .env.local 에 KOREA_INVESTMENT_API_KEY / KOREA_INVESTMENT_API_SECRET 추가 필요'
  )

  // 유효한 캐시가 있으면 즉시 반환
  const cached: { token: string; exp: number } | null = (globalThis as any).__kiToken
  if (cached && Date.now() < cached.exp) return cached.token

  // 이미 발급 중인 요청이 있으면 그 promise를 공유 (중복 발급 방지)
  if ((globalThis as any).__kiTokenFetch) {
    return (globalThis as any).__kiTokenFetch as Promise<string>
  }

  // 새 발급 요청 시작 — 동기적으로 globalThis에 등록 후 await (race condition 방지)
  const p: Promise<string> = (async () => {
    const res = await fetch(`${KI_BASE}/oauth2/tokenP`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'client_credentials', appkey: KI_KEY, appsecret: KI_SECRET }),
    })

    if (!res.ok) {
      let detail = ''
      try { detail = ` — ${JSON.stringify(await res.json())}` } catch {}
      ;(globalThis as any).__kiToken = null
      throw new Error(`한투 토큰 HTTP ${res.status}${detail}`)
    }

    const json = await res.json()
    if (!json.access_token) {
      throw new Error(`한투 토큰 응답에 access_token 없음: ${JSON.stringify(json)}`)
    }

    const entry = { token: json.access_token, exp: Date.now() + (json.expires_in - 60) * 1000 }
    ;(globalThis as any).__kiToken = entry
    return entry.token
  })().finally(() => {
    // 성공/실패 모두 in-flight promise 해제
    ;(globalThis as any).__kiTokenFetch = null
  })

  ;(globalThis as any).__kiTokenFetch = p
  return p
}
