/**
 * NextAuth 초기화 API 핸들러
 * lib/auth.ts에 정의된 authOptions를 기반으로 GET/POST 로그인 인증 요청을 처리한다.
 */
import NextAuth from 'next-auth'
import { authOptions } from '@/lib/auth'

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }
