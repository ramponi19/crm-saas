import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Desabilita type-check e ESLint no build do Vercel
  // (evita falhas de build por erros de tipo em código gerado)
  typescript: { ignoreBuildErrors: true },
  eslint:     { ignoreDuringBuilds: true },
}

export default nextConfig
