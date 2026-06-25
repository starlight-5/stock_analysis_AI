<div align="center">

# 📈 AI 주식 분석 대시보드

**한국·미국 주식을 AI가 분석해 매수·매도 전략을 자동으로 세워주는 개인 투자 도구**

![Next.js](https://img.shields.io/badge/Next.js_16-000000?style=for-the-badge&logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Google Gemini](https://img.shields.io/badge/Gemini_AI-4285F4?style=for-the-badge&logo=google&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)

</div>

---

## 이 프로젝트는?

주식 공부를 하면서 "매매 타이밍은 언제로 잡아야 하지?", "어느 섹터의 종목을 사야 하지?", "뉴스를 보고 종합적인 의견을 어떻게 내려야 하지?" 같은 판단을 매번 직접 하기가 번거로워서 만들었습니다.

기술적 지표(RSI, MACD, 볼린저 밴드, 이동평균선, 거래량) + 최신 뉴스 + 실적 발표 데이터를 모아서 Google Gemini AI에게 분석을 맡기고, 결과로 구체적인 매수·매도 전략(진입가, 손절가, 목표가)을 받아볼 수 있습니다. AI 연결이 안 될 때는 5개 지표 점수제 규칙 기반 엔진이 자동으로 대신합니다.

---

## 주요 기능

### 🔐 로그인 & 접근 제어

- 이메일/비밀번호 로그인 및 Google OAuth 로그인 지원
- 초대제 구조 — `ADMIN_EMAIL`로 지정된 관리자 외 신규 사용자는 접근 요청 필요
- 허용되지 않은 사용자가 로그인 시도 시 접근 요청 버튼 노출 → Discord 알림 전송 + DB 저장
- Google 계정 로그인 거부 시 이메일 직접 입력 후 접근 요청 가능
- 이미 이메일/비밀번호로 가입된 계정에 Google 로그인 시도 시 안내 메시지 표시

### 🛡️ 관리자 시스템 (`/admin`)

관리자 계정(`ADMIN_EMAIL`)에만 노출되는 전용 페이지.

| 기능 | 설명 |
|------|------|
| 접근 요청 승인/거부 | DB에 저장된 접근 요청 목록을 보고 승인 또는 거부 — Vercel 재배포 없이 처리 |
| 사용자 목록 조회 | 가입된 전체 사용자 이메일·가입일 확인 |
| 사용자 강제 삭제 | 악의적 계정 삭제 → 포지션·관심종목 등 연관 데이터 전부 cascade 삭제 |
| 30일 재가입 차단 | 관리자 삭제된 계정은 30일간 동일 이메일로 로그인·회원가입 불가 (`BannedEmail` 테이블) |

> 자발적 탈퇴는 차단 미적용 — 재가입 자유

### ⚙️ 계정 설정 (`/settings`)

- 현재 로그인 계정 정보 및 관리자 여부 표시
- 계정 탈퇴 기능 — 탈퇴 시 포지션·관심종목·세션·AccessRequest 전부 삭제
- 관리자 계정은 탈퇴 불가

### 🔥 지금 뜨는 섹터

ETF 수익률 데이터로 현재 강한 섹터를 객관적으로 파악하고, Gemini AI가 관련 미국·한국 종목을 추천합니다.

- 9개 섹터 × 비레버리지 ETF 2개 평균 수익률 → 상위 3개 섹터 자동 선정
- 연도별 테마 흐름 타임라인 (전전년도 → 전년도 → 현재)
- 종목 클릭 시 해당 종목 분석 페이지로 바로 이동

### 🤖 AI 매매 전략 수립

분석에 활용하는 데이터:

| 데이터 | 출처 |
|--------|------|
| 기술적 지표 (RSI·MACD·볼린저밴드·이동평균선·거래량) | 120일 일봉 직접 계산 |
| 최신 뉴스 최대 6건 | Yahoo Finance |
| 실적 발표일·예상 EPS·서프라이즈 | Yahoo Finance |

Gemini가 반환하는 전략 구조:

```
signal        : strong_buy / buy / watch / sell / strong_sell
buyStrategy   : 진입가(분할/일괄) + 각 구간 비중 + 기술적 근거
               → 포지션 등록 후에는 '추가매수 참고 자리'로 해석
stopLoss      : 손절가 + 기술적 근거 (MA·볼린저밴드 레벨 명시)
sellStrategy  : 1차·2차 목표가 + 기술적 근거
               → 포지션 카드의 목표가 달성률 진행바로 표시
risks         : 실적 발표 일정·섹터 리스크 등 최소 3개
holding       : 최소·권장·최대 보유 기간(주 단위) + 손절 조건 + 재검토 조건
```

**전략 캐시 우선순위 (새로고침 버튼 누르지 않을 때)**

```
1순위: DB — 활성 포지션에 저장된 전략 (포지션 등록 시점의 전략 그대로 유지)
2순위: 서버 인메모리 캐시 (10분 TTL)
3순위: Gemini 신규 호출
```

새로고침 버튼은 항상 Gemini를 새로 호출하고 캐시를 최신화합니다.

> AI 미연결 시 → RSI(±2) + 볼린저밴드(±2) + MACD(±1) + MA크로스(±1) + 거래량(±1) 점수제 폴백 엔진 자동 작동

### 📊 종목 상세 분석

- 120일 캔들 차트 + RSI·MACD·볼린저밴드·이동평균선·거래량 오버레이
- 한국·미국 종목 모두 지원

### 💹 시간외 가격

정규장 외 시간대에 시간외 가격·등락률을 포지션 카드에 함께 표시합니다.

| 구분 | 출처 | 조건 |
|------|------|------|
| 미국 장전 (Pre-market) | Yahoo Finance `preMarketPrice` | `marketState = PRE` |
| 미국 장후 (After-hours) | Yahoo Finance `postMarketPrice` | `marketState = POST / POSTPOST` |
| 한국 장전·장후 (시간외) | 한국투자증권 API (`FHPST01010000`) | 시간외 가격 > 0 일 때만 표시 |

### 📋 포지션 관리

- AI 전략을 원클릭으로 포지션 등록 → 전략이 DB에 저장됨
- 동일 종목 중복 등록 시 경고 → 확인하면 기존 포지션 전략 최신화
- 실시간 현재가 대비 수익률 추적
- 시간외 가격 표시 (정규장 외 시간대)
- 목표가 달성률 진행바 + 보유 기간 가이드 (경과일·상태·손절 조건)
- 포지션 등록·종료 시 Discord 자동 알림

### 🏆 종목 랭킹 & 관심종목

- 미국(Yahoo Finance) · 한국(한국투자증권 API) 거래대금·거래량 순위
- 하트 버튼으로 관심종목에 즉시 추가

### 🩺 Supabase 자동 활성화

Supabase 무료 티어는 7일간 요청이 없으면 DB가 일시 정지됩니다. Vercel Cron이 매일 자정 `/api/health`를 호출해 `SELECT 1` 쿼리로 DB를 깨워둡니다.

---

## DB 스키마

```
User            — 사용자 계정 (NextAuth 표준)
Account         — OAuth 연동 계정 (cascade)
Session         — JWT 세션 (cascade)
Position        — 포지션 (전략 전체 저장, cascade)
WatchlistItem   — 관심종목 (cascade)
AccessRequest   — 접근 요청 (pending / approved / rejected)
BannedEmail     — 관리자 삭제 후 30일 재가입 차단
```

---

## 사용 기술

| 분류 | 기술 |
|------|------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Vanilla CSS · CSS Variables 다크 테마 |
| AI | Google Gemini Flash Lite |
| 인증 | NextAuth v4 (Credentials + Google OAuth) |
| 미국 주가·차트 | Alpaca Trading API |
| 한국 주가·차트·시간외 | 한국투자증권 Open API |
| 시장·뉴스·실적·시간외(US) | Yahoo Finance |
| 데이터베이스 | Supabase PostgreSQL (Prisma v7) |
| 캐시 | `globalThis` 인메모리 · TTL 관리 |
| 배포 | Vercel |
| DB 활성화 유지 | Vercel Cron (매일 자정) |

---

## 시작하기

### 1. 저장소 클론 & 의존성 설치

```bash
git clone https://github.com/starlight-5/stock_analysis_AI.git
cd stock_analysis_AI
npm install
```

### 2. 환경 변수 설정

`.env.local.example`을 복사해 `.env.local`을 만들고 값을 채웁니다.

```bash
cp .env.local.example .env.local
```

| 변수 | 설명 |
|------|------|
| `ALPACA_API_KEY_ID` / `ALPACA_SECRET_KEY` | 미국 주가 (Alpaca) |
| `KOREA_INVESTMENT_API_KEY` / `KOREA_INVESTMENT_API_SECRET` | 한국 주가·시간외 (한국투자증권) |
| `KOREA_INVESTMENT_ACCOUNT` | 한국투자증권 계좌번호 (주문용, 조회엔 불필요) |
| `GEMINI_API_KEY` | AI 분석 (Google Gemini) |
| `DATABASE_URL` | Supabase PostgreSQL 연결 문자열 |
| `NEXTAUTH_SECRET` | JWT 암호화 키 (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | 서비스 URL (`http://localhost:3000`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `ADMIN_EMAIL` | 관리자 이메일 — 이 계정만 항상 로그인 허용 + 관리 페이지 접근 가능 |
| `DISCORD_WEBHOOK_URL` | 포지션 등록·종료 알림 웹훅 (선택) |
| `DISCORD_ACCESS_REQUEST_WEBHOOK_URL` | 접근 요청 알림 웹훅 (선택) |

> `GEMINI_API_KEY`가 없어도 규칙 기반 폴백 엔진으로 모든 기능이 작동합니다.

### 3. DB 마이그레이션

```bash
npx prisma db push
```

### 4. 실행

```bash
npm run dev
# → http://localhost:3000
```

---

## 배포 (Vercel)

1. Vercel에 저장소 연결
2. **Settings → Environment Variables**에 `.env.local`의 모든 값 입력
3. `NEXTAUTH_URL`은 Vercel 배포 URL로 설정 (`https://your-app.vercel.app`)
4. Push 시 자동 배포
5. Vercel Cron은 `vercel.json`에 정의되어 있어 별도 설정 불필요

---

## 배운 것들

- **외부 API 조합**: Yahoo Finance(비공식), Alpaca, 한국투자증권 API를 하나의 스냅샷으로 합치는 설계
- **AI 프롬프트 엔지니어링**: 정형화된 JSON 전략을 안정적으로 반환하게 Gemini 프롬프트 설계
- **폴백 패턴**: AI 장애 상황을 상정하고 규칙 기반 엔진을 병렬 유지하는 방식
- **캐시 전략**: DB → 인메모리 캐시 → API 호출 순으로 우선순위를 두어 외부 API 쿼터 보호
- **인증 설계**: NextAuth v4 + Prisma 7 + Supabase 연동, 서버리스 환경의 CSRF 쿠키 이슈 해결
- **서버리스 주의점**: Vercel 함수는 `return` 즉시 종료 — 비동기 작업(Discord 알림 등)은 반드시 `await` 필요
- **접근 제어**: 환경변수 재배포 없이 DB 기반으로 사용자 승인·거부·차단을 동적으로 관리

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
- [NextAuth.js v4 Docs](https://next-auth.js.org/)
- [Supabase Docs](https://supabase.com/docs)
- 토스 디자인 시스템 (UI 참고)
