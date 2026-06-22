# 📈 AI 기반 주식 분석 및 투자 전략 대시보드 (Stock Analysis AI)

본 프로젝트는 **Next.js (App Router)**를 기반으로 구축된 현대적인 **AI 주식 분석 대시보드**입니다. 한국 및 미국 주식 시장의 실시간 지표를 추적하고, 보조지표 분석 데이터와 **Google Gemini AI**를 융합하여 사용자에게 명확하고 설득력 있는 투자 전략을 제안합니다.

---

## ✨ 주요 기능 및 특징

1. **실시간 시장 상태 모니터링 및 개장 여부 감시**
   - 한국(KST) 및 미국(ET) 주식 시장의 개장/휴장 상태를 실시간 시간대(Timezone) 설정을 반영하여 초 단위로 정확하게 파악합니다.
   - NASDAQ, S&P 500, VIX(공포 지수), USD/KRW(원달러 환율) 등의 주요 시장 지수를 5분 단위 캐싱과 함께 제공합니다.

2. **시장 심리(Sentiment) 및 변동성 분석**
   - 주요 지수의 등락률과 VIX 지수의 수치를 종합 분석하여 현재 시장이 안정세인지, 고변동성 위험 상태인지 등의 시장 심리 카드를 직관적으로 시각화합니다.

3. **국가별 실시간 종목 랭킹 조회**
   - **미국 시장**: Yahoo Finance 데이터를 기반으로 실시간 거래대금 또는 거래량 순위 상위 종목을 조회합니다.
   - **한국 시장**: 한국투자증권 Open API를 통해 국내 시장 거래량/거래대금 상위 종목을 조회합니다.

4. **관심 종목(Watchlist) 관리**
   - 검색창을 통해 검색하거나, 실시간 랭킹 리스트에서 하트(♥) 아이콘을 눌러 관심 종목을 손쉽게 추가 및 제거할 수 있습니다.
   - 관심 종목 목록은 로컬 백엔드 API를 통해 저장 및 관리됩니다.

5. **정밀한 기술적 보조 지표 계산 및 시각화**
   - Alpaca API(미국) 및 한국투자증권 API(한국)로부터 최신 120일 분량의 일봉 차트 데이터를 페치합니다.
   - **RSI(14)**, **MACD (12, 26, 9)**, **Bollinger Bands (20, 2)**, **이동평균선 (MA 5, 20, 60, 120)**, **거래량 비율** 등의 보조지표를 실시간 계산합니다.

6. **Google Gemini AI 융합 투자 전략 생성 (폴백 시스템 탑재)**
   - 계산된 보조지표 스냅샷(과매수/과매도, 데드/골든 크로스 등)을 Gemini AI 프롬프트에 제공하여 맞춤형 매수/매도 시나리오를 받아옵니다.
   - **폴백(Fallback) 안전망**: Gemini API Key가 등록되지 않았거나, 쿼터 제한(Rate Limit)을 넘었을 때에도 서비스가 중단되지 않도록 **자체 규칙 기반(Rule-based) 투자 분석 엔진**이 자동 작동합니다.

---

## 🛠 기술 스택

- **Framework**: [Next.js](https://nextjs.org/) (App Router, Version 14+)
- **Language**: TypeScript, JavaScript
- **Styling**: Vanilla CSS (CSS Variables를 활용한 프리미엄 테마)
- **APIs**:
  - **Google Gemini 1.5 Flash (v1beta API)** (AI 투자 전략 수립)
  - **Alpaca Trading API** (미국 주식 시세 데이터 수집)
  - **한국투자증권 Open API** (국내 주식 시세 데이터 수집)
  - **Yahoo Finance** (글로벌 시장 지수 및 종목 랭킹 수집)
- **State & Cash**: Global Memory Cache (10분 TTL 적용으로 API 쿼터 보호 및 성능 최적화)

---

## 📂 프로젝트 폴더 구조

```text
stock-app/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── market/        # 글로벌 시장 지수 조회 API
│   │   │   ├── rankings/      # 거래대금/거래량 순위 API
│   │   │   ├── search/        # 종목 검색 API
│   │   │   ├── stock/         # 특정 종목 기본 정보 API
│   │   │   ├── strategy/      # Gemini AI / 규칙 기반 투자 전략 수립 API
│   │   │   └── watchlist/     # 관심 종목(Watchlist) CRUD API
│   │   ├── stock/
│   │   │   └── [ticker]/      # 종목별 상세 분석 및 차트 뷰 페이지
│   │   ├── layout.tsx         # 전역 레이아웃 설정
│   │   ├── globals.css        # 다크/라이트 CSS 변수 및 전역 스타일
│   │   └── page.tsx           # 메인 대시보드 페이지 (실시간 랭킹, 지수, 관심종목)
│   ├── components/            # 공통 UI 컴포넌트 (검색바 등)
│   ├── lib/
│   │   ├── dataSource.ts      # Alpaca 및 한투 API를 활용한 주가 데이터 로더
│   │   ├── indicators.ts      # RSI, MACD, BB, MA 보조 지표 계산 로직 (SRP 준수)
│   │   └── kisToken.ts        # 한국투자증권 API OAuth 토큰 자동 갱신 관리자
│   └── types/
│       └── stock.ts           # 데이터 모델 공통 타입 선언
├── .env.local.example         # 로컬 환경 변수 설정 템플릿
├── next.config.js             # Next.js 프로젝트 설정 파일
└── tsconfig.json              # TypeScript 컴파일러 설정
```

---

## 🚀 시작하기

### 1. 프로젝트 복제 및 의존성 설치

```bash
# 의존성 패키지 설치
npm install
```

### 2. 환경 변수 설정

프로젝트 루트 디렉토리에 `.env.local` 파일을 생성하고 아래의 예시를 참고하여 필요한 API 키들을 입력합니다. (상세 가이드는 `.env.local.example` 파일에도 기재되어 있습니다.)

```ini
# ── Alpaca Trading API ─────────────────────────────────
ALPACA_API_KEY_ID=여러분의_알파카_API_KEY_ID
ALPACA_SECRET_KEY=여러분의_알파카_SECRET_KEY

# ── 한국투자증권 Open API ──────────────────────────────
KOREA_INVESTMENT_API_KEY=여러분의_한투_APPKEY
KOREA_INVESTMENT_API_SECRET=여러분의_한투_SECRETKEY
KOREA_INVESTMENT_ACCOUNT=여러분의_종합계좌번호
# KOREA_INVESTMENT_MODE=mock  # 모의투자 서버 사용 시 설정

# ── Google Gemini API ──────────────────────────────────
GEMINI_API_KEY=여러분의_GEMINI_API_KEY
```

### 3. 개발 서버 실행

```bash
# 로컬 개발 서버 시작
npm run dev
```

서버 실행 후 브라우저에서 `http://localhost:3000`으로 접속하면 AI 주식 분석 대시보드를 사용할 수 있습니다.

---

## 💡 개발 및 설계 원칙 (SOLID & OOP)

- **단일 책임 원칙 (SRP)**: 주가 조회([dataSource.ts](file:///c:/Project/stock-app-src/stock-app/src/lib/dataSource.ts)), 보조 지표 계산([indicators.ts](file:///c:/Project/stock-app-src/stock-app/src/lib/indicators.ts)), 토큰 관리([kisToken.ts](file:///c:/Project/stock-app-src/stock-app/src/lib/kisToken.ts)) 등의 역할이 독립적인 모듈로 철저히 구분되어 유지보수성이 극대화되었습니다.
- **개방-폐쇄 원칙 (OCP)**: 한국 주식과 미국 주식에 대해 인터페이스 타입(`DataSource`)과 다형적 분기를 제공하여, 향후 다른 거래소(예: 바이낸스 코인 시세 등) 데이터 소스가 추가되더라도 기존 코드를 크게 수정하지 않고 유연하게 연동을 확장할 수 있도록 설계되었습니다.
- **예외 복원력 (Resilience)**: 외부 API(Gemini, 한국투자증권 등)의 불안정한 호출 에러나 네트워크 지연 시 폴백 로직을 구비하여 사용자 경험을 차단하지 않습니다.
