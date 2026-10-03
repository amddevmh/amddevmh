import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Permet plusieurs serveurs de développement en parallèle (NEXT_DIST_DIR=.next-xyz)
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  transpilePackages: ['@hi/ui', '@hi/core', '@hi/db', '@hi/integrations'],
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'admin.hitravel.tn' }],
  },
  poweredByHeader: false,
}

export default nextConfig
