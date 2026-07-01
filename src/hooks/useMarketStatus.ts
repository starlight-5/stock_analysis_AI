'use client'
import { useEffect, useState } from 'react'

/**
 * Intl.DateTimeFormat + 시간대 이름 사용 → 서머타임(DST) 자동 처리.
 * 직접 UTC 오프셋을 계산하면 DST 처리가 틀릴 수 있어 이 방식이 정확.
 */
function getMarketStatus(): { krOpen: boolean; usOpen: boolean } {
  const now = new Date()

  const parts = (tz: string) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, weekday: 'short',
      hour: 'numeric', minute: 'numeric', hour12: false,
    }).formatToParts(now)

  const val = (ps: Intl.DateTimeFormatPart[], t: string) =>
    parseInt(ps.find(p => p.type === t)?.value ?? '0', 10) % 24 // 일부 환경에서 24 반환 방지

  const kp = parts('Asia/Seoul')
  const up = parts('America/New_York')

  const kMin = val(kp, 'hour') * 60 + val(kp, 'minute')
  const uMin = val(up, 'hour') * 60 + val(up, 'minute')
  const kDay = kp.find(p => p.type === 'weekday')?.value ?? ''
  const uDay = up.find(p => p.type === 'weekday')?.value ?? ''
  const wday = (d: string) => !['Sat', 'Sun'].includes(d)

  return {
    krOpen: wday(kDay) && kMin >= 9*60    && kMin < 15*60+30, // 09:00~15:30 KST
    usOpen: wday(uDay) && uMin >= 9*60+30 && uMin < 16*60,    // 09:30~16:00 ET
  }
}

/** 1분마다 갱신 */
export function useMarketStatus() {
  const [status, setStatus] = useState(getMarketStatus)
  useEffect(() => {
    const id = setInterval(() => setStatus(getMarketStatus()), 60_000)
    return () => clearInterval(id)
  }, [])
  return status
}
