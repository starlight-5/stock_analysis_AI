-- 이 마이그레이션은 이미 Supabase에 db push로 반영되어 있던 테이블들을
-- 마이그레이션 히스토리에 뒤늦게 기록하기 위한 것입니다 (baseline).
-- 실제 DB에는 이미 존재하므로 `prisma migrate resolve --applied`로만 적용하고,
-- 이 SQL 자체를 기존 운영 DB에 다시 실행하지 않습니다.

-- CreateTable
CREATE TABLE "AccessRequest" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "AccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BannedEmail" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "bannedUntil" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BannedEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KisTokenCache" (
    "id" TEXT NOT NULL DEFAULT 'kis_token',
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KisTokenCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyRecommendation" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "sectorId" TEXT NOT NULL,
    "sectorName" TEXT NOT NULL,
    "sectorEmoji" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "strategy" JSONB NOT NULL,
    "snapshot" JSONB NOT NULL,
    "signal" TEXT NOT NULL,
    "fallback" BOOLEAN NOT NULL DEFAULT false,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccessRequest_email_key" ON "AccessRequest"("email");

-- CreateIndex
CREATE UNIQUE INDEX "BannedEmail_email_key" ON "BannedEmail"("email");

-- CreateIndex
CREATE INDEX "DailyRecommendation_date_sectorId_idx" ON "DailyRecommendation"("date", "sectorId");

-- CreateIndex
CREATE INDEX "DailyRecommendation_date_signal_idx" ON "DailyRecommendation"("date", "signal");

-- CreateIndex
CREATE UNIQUE INDEX "DailyRecommendation_date_ticker_key" ON "DailyRecommendation"("date", "ticker");
