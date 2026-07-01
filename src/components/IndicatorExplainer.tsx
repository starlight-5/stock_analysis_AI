'use client'
/**
 * IndicatorExplainer
 * IndicatorSnapshot의 각 지표(RSI, MACD, 볼린저밴드, MA크로스, 거래량, HV, BB폭)를
 * 사람이 읽기 쉬운 설명 카드로 변환해 차트 아래에 표시하는 컴포넌트.
 * buildItems()에서 수치 → 상태(과매수/과매도/중립 등) + 해설 문자열로 매핑한다.
 */

import type { IndicatorSnapshot } from '@/types/stock'

interface ExplainItem {
  label: string
  value: string
  status: string
  statusColor: string
  desc: string
}

function buildItems(snap: IndicatorSnapshot): ExplainItem[] {
  const rsi = snap.rsi
  const rsiStatus =
    rsi == null ? { s: '데이터 없음', c: 'var(--color-text-secondary)' }
    : rsi < 30  ? { s: '과매도',      c: 'var(--color-positive-dark)' }
    : rsi < 45  ? { s: '약세',        c: 'var(--color-positive-muted)' }
    : rsi < 55  ? { s: '중립',        c: 'var(--color-text-secondary)' }
    : rsi < 70  ? { s: '강세',        c: 'var(--color-caution)' }
    :             { s: '과매수',      c: 'var(--color-negative-dark)' }

  const rsiDesc =
    rsi == null ? '데이터를 계산하는 데 충분한 기간이 필요합니다.'
    : rsi < 30  ? '주가가 단기간에 너무 많이 떨어진 상태입니다. 반등 가능성이 높아 매수 타이밍을 노려볼 수 있습니다.'
    : rsi < 45  ? '매도 압력이 우세하지만 극단적이진 않습니다. 추가 하락 여부를 확인하며 접근하는 것이 좋습니다.'
    : rsi < 55  ? '매수와 매도 세력이 균형을 이루고 있습니다. 뚜렷한 방향성이 나오기 전까지 관망이 유리합니다.'
    : rsi < 70  ? '상승 흐름이 이어지고 있습니다. 추세가 꺾이지 않는 한 보유 전략이 유효합니다.'
    :             '단기 과열 상태입니다. 차익 실현 매물이 쏟아질 수 있어 신규 매수보다는 분할 매도를 고려하세요.'

  const hist = snap.histogram
  const macdStatus =
    hist == null ? { s: '데이터 없음', c: 'var(--color-text-secondary)' }
    : hist > 0.5 ? { s: '강한 상승',  c: 'var(--color-positive-dark)' }
    : hist > 0   ? { s: '약한 상승',  c: 'var(--color-positive-muted)' }
    : hist > -0.5? { s: '약한 하락',  c: 'var(--color-caution)' }
    :              { s: '강한 하락',  c: 'var(--color-negative-dark)' }

  const macdDesc =
    hist == null  ? '데이터를 계산하는 데 충분한 기간이 필요합니다.'
    : hist > 0    ? `MACD 히스토그램이 양수(+${hist.toFixed(2)})입니다. 단기 매수세가 매도세를 앞서고 있어 상승 모멘텀이 살아있습니다.`
    :               `MACD 히스토그램이 음수(${hist.toFixed(2)})입니다. 단기 매도세가 강해지고 있어 주의가 필요합니다.`

  const bbp = snap.bbPosition
  const bbStatus =
    bbp == null  ? { s: '데이터 없음', c: 'var(--color-text-secondary)' }
    : bbp < 0.2  ? { s: '하단 근접',  c: 'var(--color-positive-dark)' }
    : bbp < 0.4  ? { s: '하단부',     c: 'var(--color-positive-muted)' }
    : bbp < 0.6  ? { s: '중간',       c: 'var(--color-text-secondary)' }
    : bbp < 0.8  ? { s: '상단부',     c: 'var(--color-caution)' }
    :              { s: '상단 근접',  c: 'var(--color-negative-dark)' }

  const bbDesc =
    bbp == null ? '데이터를 계산하는 데 충분한 기간이 필요합니다.'
    : bbp < 0.2 ? '주가가 볼린저 밴드 하단 근처에 있습니다. 통계적으로 평균 회귀 가능성이 높아 매수 기회로 볼 수 있습니다.'
    : bbp < 0.4 ? '밴드 하단부에 위치해 있습니다. 지지 여부를 확인하며 분할 매수를 검토할 만합니다.'
    : bbp < 0.6 ? `밴드 중간(${(bbp*100).toFixed(0)}%)에 위치해 있습니다. 상·하단 어디로도 치우치지 않은 중립 구간입니다.`
    : bbp < 0.8 ? '밴드 상단부에 가까워지고 있습니다. 추가 상승 여력이 있지만 과열 경계를 염두에 두세요.'
    :             '주가가 볼린저 밴드 상단에 닿아 있습니다. 단기 과열 신호로, 일부 차익 실현을 고려할 시점입니다.'

  const crossStatus =
    snap.maCrossState === 'golden' ? { s: '골든크로스', c: 'var(--color-positive-dark)' }
    : snap.maCrossState === 'dead' ? { s: '데드크로스', c: 'var(--color-negative-dark)' }
    :                                { s: '중립',       c: 'var(--color-text-secondary)' }

  const crossDesc =
    snap.maCrossState === 'golden'
      ? '5일 이동평균이 20일 이동평균을 위로 돌파했습니다(골든크로스). 단기 상승 추세 전환 신호로 매수 관점에서 유리한 시점입니다.'
      : snap.maCrossState === 'dead'
      ? '5일 이동평균이 20일 이동평균 아래로 내려갔습니다(데드크로스). 단기 하락 추세 진입 신호로 신중한 접근이 필요합니다.'
      : '5일선과 20일선이 엇비슷하게 움직이고 있습니다. 아직 방향성이 확정되지 않았으니 추가 신호를 기다리세요.'

  const vr = snap.volumeRatio
  const vrStatus =
    vr > 2    ? { s: '급격한 급증', c: 'var(--color-positive-dark)' }
    : vr > 1.5? { s: '거래량 급증', c: 'var(--color-positive-muted)' }
    : vr > 0.7? { s: '보통',        c: 'var(--color-text-secondary)' }
    :           { s: '거래량 감소', c: 'var(--color-caution)' }

  const vrDesc =
    vr > 2    ? `최근 5일 거래량이 평균의 ${vr.toFixed(1)}배입니다. 매우 강한 관심이 몰리고 있어 큰 움직임이 예상됩니다. 방향을 확인 후 대응하세요.`
    : vr > 1.5? `거래량이 평균(${vr.toFixed(1)}배)보다 많습니다. 시장 참여자들의 관심이 높아지고 있습니다. 가격 방향과 함께 해석하면 좋습니다.`
    : vr > 0.7? `거래량이 평균 수준(${vr.toFixed(2)}배)입니다. 특별한 이상 신호 없이 일반적인 거래 흐름이 이어지고 있습니다.`
    :           `거래량이 평균보다 적습니다(${vr.toFixed(2)}배). 시장 관심이 줄어든 상태라 가격 움직임의 신뢰도가 낮을 수 있습니다.`

  return [
    {
      label: 'RSI (14)',
      value: rsi != null ? rsi.toFixed(1) : 'N/A',
      status: rsiStatus.s, statusColor: rsiStatus.c,
      desc: rsiDesc,
    },
    {
      label: 'MACD 히스토그램',
      value: hist != null ? hist.toFixed(2) : 'N/A',
      status: macdStatus.s, statusColor: macdStatus.c,
      desc: macdDesc,
    },
    {
      label: '볼린저 밴드 위치',
      value: bbp != null ? `${(bbp * 100).toFixed(0)}%` : 'N/A',
      status: bbStatus.s, statusColor: bbStatus.c,
      desc: bbDesc,
    },
    {
      label: '이동평균 크로스',
      value: snap.maCrossState === 'golden' ? '골든' : snap.maCrossState === 'dead' ? '데드' : '중립',
      status: crossStatus.s, statusColor: crossStatus.c,
      desc: crossDesc,
    },
    {
      label: '거래량 비율',
      value: `${vr.toFixed(2)}x`,
      status: vrStatus.s, statusColor: vrStatus.c,
      desc: vrDesc,
    },
  ]
}

export default function IndicatorExplainer({ snap }: { snap: IndicatorSnapshot }) {
  const items = buildItems(snap)

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{
        fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)',
        marginBottom: 10, paddingBottom: 8,
        borderBottom: '0.5px solid var(--color-border-tertiary)',
      }}>
        지표 해설 — 초보자 안내
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(({ label, value, status, statusColor, desc }) => (
          <div key={label} style={{
            background: 'var(--color-background-secondary)',
            borderRadius: 10, padding: '12px 14px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                {label}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: statusColor }}>
                {value}
              </span>
              <span style={{
                fontSize: 11, padding: '1px 7px', borderRadius: 10,
                background: statusColor + '22',
                color: statusColor,
                border: `0.5px solid ${statusColor}55`,
              }}>
                {status}
              </span>
            </div>
            <p style={{
              fontSize: 12, color: 'var(--color-text-secondary)',
              lineHeight: 1.7, margin: 0,
            }}>
              {desc}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
