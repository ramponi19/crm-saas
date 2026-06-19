import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: 'drive.google.com' },
    ],
  },
  // força rebuild completo do CSS
  generateBuildId: async () => `build-${Date.now()}`,
}

export default nextConfig
