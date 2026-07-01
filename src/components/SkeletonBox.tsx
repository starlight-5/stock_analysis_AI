'use client'
/**
 * SkeletonBox
 * Shimmer 애니메이션이 적용된 로딩 플레이스홀더.
 * 데이터 로딩 중 레이아웃 이동(CLS) 없이 자리를 차지한다.
 * globals.css의 @keyframes shimmer 에 의존한다.
 */
export default function SkeletonBox({
  width = '100%',
  height = 16,
  borderRadius = 6,
  style,
}: {
  width?: number | string
  height?: number | string
  borderRadius?: number | string
  style?: React.CSSProperties
}) {
  return (
    <div style={{
      width,
      height,
      borderRadius,
      background: 'linear-gradient(90deg, var(--color-background-secondary) 25%, var(--color-border-secondary) 50%, var(--color-background-secondary) 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s ease-in-out infinite',
      flexShrink: 0,
      ...style,
    }} />
  )
}
