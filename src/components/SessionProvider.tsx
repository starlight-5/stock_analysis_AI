'use client'
/**
 * SessionProvider
 * NextAuth SessionProvider를 'use client' 경계 안으로 래핑하여
 * Server Component인 layout.tsx에서 import할 수 있게 한다.
 */
import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react'

export default function SessionProvider({ children }: { children: React.ReactNode }) {
  return <NextAuthSessionProvider>{children}</NextAuthSessionProvider>
}
