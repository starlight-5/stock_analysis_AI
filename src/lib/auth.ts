import type { NextAuthOptions } from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import GoogleProvider from 'next-auth/providers/google'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId:     process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      name: '이메일',
      credentials: {
        email:    { label: '이메일', type: 'email' },
        password: { label: '비밀번호', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        })
        if (!user?.password) return null

        const ok = await bcrypt.compare(credentials.password as string, user.password)
        if (!ok) return null

        return { id: user.id, email: user.email, name: user.name, image: user.image }
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
    error:  '/login',
  },
  cookies: {
    csrfToken: {
      name: 'next-auth.csrf-token',
      options: {
        httpOnly: true,
        sameSite: 'lax' as const,
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
    sessionToken: {
      name: process.env.NODE_ENV === 'production'
        ? '__Secure-next-auth.session-token'
        : 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax' as const,
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false

      // 관리자는 환경변수로 직접 허용
      const adminEmail = process.env.ADMIN_EMAIL
        ?? process.env.ALLOWED_EMAILS?.split(',')[0]?.trim()
      if (adminEmail && user.email === adminEmail) return true

      // 관리자에 의해 차단된 이메일 확인
      const ban = await prisma.bannedEmail.findFirst({
        where: { email: user.email, bannedUntil: { gt: new Date() } },
      })
      if (ban) return false

      // DB에서 승인된 요청 확인
      const request = await prisma.accessRequest.findFirst({
        where: { email: user.email, status: 'approved' },
      })
      return !!request
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        const adminEmail = process.env.ADMIN_EMAIL
          ?? process.env.ALLOWED_EMAILS?.split(',')[0]?.trim()
        token.isAdmin = !!user.email && user.email === adminEmail
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id      = token.id
        ;(session.user as any).isAdmin = token.isAdmin
      }
      return session
    },
  },
}
