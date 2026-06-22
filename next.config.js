/** @type {import('next').NextConfig} */
const nextConfig = {
  // Alpha Vantage, 한투 API는 서버사이드에서만 호출
  // 환경변수가 클라이언트에 노출되지 않도록 주의
  serverExternalPackages: [],
}

module.exports = nextConfig
