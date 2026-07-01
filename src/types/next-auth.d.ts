/**
 * next-auth 타입 확장
 * Session.user에 id 필드, JWT에 id / isAdmin 필드를 추가한다.
 */
import 'next-auth'
import 'next-auth/jwt'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
  }
}
