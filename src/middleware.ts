export { default } from 'next-auth/middleware'

export const config = {
  // API 라우트는 각 핸들러가 직접 401 반환, 페이지만 보호
  matcher: [
    '/((?!api/|login|register|_next/static|_next/image|favicon.ico).*)',
  ],
}
