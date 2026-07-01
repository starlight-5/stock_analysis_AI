/**
 * Prisma 클라이언트 싱글톤
 *
 * Next.js 개발 서버는 HMR(Hot Module Replacement)로 모듈을 재로드하므로
 * 매번 새 PrismaClient를 만들면 커넥션 풀이 고갈된다.
 * globalThis에 인스턴스를 캐싱해 개발 환경에서도 재사용한다.
 * 프로덕션(Vercel)에서는 모듈이 재로드되지 않으므로 항상 새로 생성한다.
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const connectionString = process.env.DATABASE_URL!

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString })
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

// 개발 환경에서만 globalThis에 저장 (프로덕션은 불필요)
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
