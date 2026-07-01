'use client'
import { useEffect, useState } from 'react'

const INTERVAL_MS = 5 * 60 * 1000 // 5분

/**
 * 실제 시계 기준 5분 단위(:00, :05, :10 ... :55)에 맞춰 tick을 발생시키는 공용 타이머.
 * 탭을 열거나 새로고침해도 항상 동일한 시각에 갱신된다.
 *
 * 동작 방식:
 *   1. 현재 시각에서 다음 5분 경계까지 setTimeout으로 대기
 *   2. 이후 setInterval(5분)으로 정확한 주기 유지
 *   3. 모듈 레벨 싱글톤 → setInterval 하나만 실행
 *   4. 구독자가 0이 되면 타이머 자동 정지
 */

type Listener = () => void

let timeoutId: ReturnType<typeof setTimeout> | null = null
let intervalId: ReturnType<typeof setInterval> | null = null
let tick = 0
const listeners = new Set<Listener>()

/** 현재 시각에서 다음 5분 경계까지 남은 ms */
function msUntilNextTick(): number {
  const now = Date.now()
  return INTERVAL_MS - (now % INTERVAL_MS)
}

function fireTick() {
  tick += 1
  listeners.forEach(fn => fn())
}

function startIfNeeded() {
  if (timeoutId !== null || intervalId !== null) return

  // 다음 5분 경계(:00, :05, :10 ...)까지 대기 후 시작
  timeoutId = setTimeout(() => {
    timeoutId = null
    fireTick()
    intervalId = setInterval(fireTick, INTERVAL_MS)
  }, msUntilNextTick())
}

function stopIfEmpty() {
  if (listeners.size > 0) return
  if (timeoutId !== null) { clearTimeout(timeoutId); timeoutId = null }
  if (intervalId !== null) { clearInterval(intervalId); intervalId = null }
}

/**
 * 현재 tick 값을 반환한다.
 * tick이 바뀔 때마다 컴포넌트가 리렌더되므로,
 * useEffect의 deps에 tick을 넣어 갱신 트리거로 사용한다.
 */
export function useRefreshTick(): number {
  const [currentTick, setCurrentTick] = useState(tick)

  useEffect(() => {
    const handler = () => setCurrentTick(t => t + 1)
    listeners.add(handler)
    startIfNeeded()
    return () => {
      listeners.delete(handler)
      stopIfEmpty()
    }
  }, [])

  return currentTick
}
