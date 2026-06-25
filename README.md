<div align="center">

# 📈 AI 주식 분석 대시보드

**한국·미국 주식을 AI가 분석해 매수·매도 전략을 자동으로 세워주는 개인 투자 도구**

![Next.js](https://img.shields.io/badge/Next.js_14-000000?style=for-the-badge&logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Google Gemini](https://img.shields.io/badge/Gemini_AI-4285F4?style=for-the-badge&logo=google&logoColor=white)
![Yahoo Finance](https://img.shields.io/badge/Yahoo_Finance-6001D2?style=for-the-badge&logo=yahoo&logoColor=white)

</div>

---

## 이 프로젝트는?

주식 공부를 하면서 "매매 타이밍은 언제로 잡아야하지?", "어느 섹터의 종목을 사야하지?", "뉴스를 보고 종합적인 의견 종합을 어떻게 해야하지?" 같은 판단을 매번 직접 하기가 번거로워서 만들었습니다.

기술적 지표(RSI, MACD, 볼린저 밴드, 이동평균선, 거래량) + 최신 뉴스 + 실적 발표 데이터를 모아서 Google Gemini AI한테 분석을 맡기고, 결과로 구체적인 매수·매도 전략(진입가, 손절가, 목표가)을 받아볼 수 있습니다. AI 연결이 안 될 때는 5개 지표 점수제 규칙 기반 엔진이 자동으로 대신합니다.

---

## 주요 기능

### 🔥 지금 뜨는 섹터
ETF 수익률 데이터로 현재 강한 섹터를 객관적으로 파악하고, Gemini AI가 관련 미국·한국 종목을 추천합니다.

- 9개 섹터 × 비레버리지 ETF 2개 평균 수익률 → 상위 3개 섹터 자동 선정
- 연도별 테마 흐름 타임라인 (전전년도 → 전년도 → 현재)
- 종목 클릭 시 해당 종목 분석 페이지로 바로 이동

### 🤖 AI 매매 전략 수립
분석에 활용하는 데이터:

| 데이터 | 출처 |
|--------|------|
| 기술적 지표 (RSI·MACD·볼린저밴드·이동평균선, 거래량) | 120일 일봉 직접 계산 |
| 최신 뉴스 최대 6건 | Yahoo Finance |
| 실적 발표일·예상 EPS·서프라이즈 | Yahoo Finance |
| 시장 심리 (VIX) | Yahoo Finance |

Gemini가 반환하는 전략 구조:
```
signal: strong_buy / buy / watch / sell / strong_sell
진입 전략: 분할 매수 가격대 + 각 구간 비중
손절 전략: 손절가 + 기술적 근거 (이동평균선, 볼린저밴드 상, 하, 중심 레벨 명시)
목표 전략: 1차,2차 목표가 + 기술적 근거
리스크: 실적 발표 일정·섹터 리스크 등
```

> AI 미연결 시 → RSI(|2|) + 볼린저밴드(|2|) + MACD(|1|) + 이동평균선크로스(|1|) + 거래량(|1|) 점수제 폴백 엔진 자동 작동

### 📊 종목 상세 분석
- 120일 캔들 차트 + RSI·MACD·볼린저밴드·이동평균선·거래량 오버레이
- 한국·미국 종목 모두 지원

### 📋 포지션 관리
- AI 전략을 원클릭으로 포지션 등록
- 동일 종목 중복 등록 시 경고 → 확인하면 기존 포지션 전략 최신화
- 실시간 수익률 및 목표가 달성률 추적
- 포지션 등록 시 Discord 자동 알림 전송

### 🏆 종목 랭킹 & 관심종목
- 미국(Yahoo Finance) · 한국(한국투자증권 API) 거래대금·거래량 순위
- 하트 버튼으로 관심종목에 즉시 추가

---

## 스크린샷

> 스크린샷을 추가하려면 `public/screenshots/` 폴더에 이미지를 넣고 아래 태그를 수정하세요.

```
<!-- 예시 -->
![메인 대시보드](public/screenshots/main.png)
![AI 전략 패널](public/screenshots/strategy.png)
```

---

## 사용 기술

| 분류 | 기술 |
|------|------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Vanilla CSS · CSS Variables 다크 테마 |
| AI | Google Gemini 3.1 Flash Lite |
| 미국 주가 | Alpaca Trading API |
| 한국 주가 | 한국투자증권 Open API |
| 시장·뉴스·실적 | Yahoo Finance |
| 저장소 | 로컬 JSON 파일 (`data/positions.json`) |
| 캐시 | `globalThis` 인메모리 · TTL 관리 |

---

## 시작하기

### 1. 저장소 클론 & 의존성 설치

```bash
git clone https://github.com/starlight-5/stock-app.git
cd stock-app
npm install
```

### 2. 환경 변수 설정

`.env.local` 파일을 생성하고 아래 값을 채웁니다.

```ini
# Alpaca Trading API (미국 주가)
ALPACA_API_KEY_ID=
ALPACA_SECRET_KEY=

# 한국투자증권 Open API (한국 주가)
KOREA_INVESTMENT_API_KEY=
KOREA_INVESTMENT_API_SECRET=
KOREA_INVESTMENT_ACCOUNT=
# KOREA_INVESTMENT_MODE=mock   # 모의투자 서버 사용 시

# Google Gemini API (AI 전략·섹터 추천)
GEMINI_API_KEY=

# Discord 웹훅 (선택)
DISCORD_WEBHOOK_URL=
```

> `GEMINI_API_KEY`가 없어도 규칙 기반 폴백 엔진으로 모든 기능이 작동합니다.

### 3. 실행

```bash
npm run dev
# → http://localhost:3000
```

---

## 배운 것들

- **외부 API 조합**: Yahoo Finance(비공식), Alpaca, 한국투자증권 API를 하나의 스냅샷으로 합치는 설계
- **AI 프롬프트 엔지니어링**: 정형화된 JSON 전략을 안정적으로 반환하게 Gemini 프롬프트 설계
- **폴백 패턴**: AI 장애 상황을 상정하고 규칙 기반 엔진을 병렬 유지하는 방식
- **캐시 전략**: 외부 API 쿼터 보호를 위해 `globalThis` TTL 캐시 계층 구성
- **타입 안전성**: `satisfies` / `as const` 패턴과 좁은 리터럴 타입의 충돌 해결

---

## 만든 사람

**starlight-5**
- GitHub: [github.com/starlight-5](https://github.com/starlight-5)

---

## 참고 & 도움받은 곳

- [Yahoo Finance API (비공식 문서)](https://github.com/gadicc/node-yahoo-finance2)
- [Alpaca Trading API Docs](https://docs.alpaca.markets/)
- [한국투자증권 Open API](https://apiportal.koreainvestment.com/)
- [Google Gemini API Docs](https://ai.google.dev/gemini-api/docs)
- 토스 디자인 시스템 (UI 참고)

---

## 추후 구현 예정

- [ ] 포지션 일일 리포트 Discord 자동 전송 (cron 스케줄러 연동)
