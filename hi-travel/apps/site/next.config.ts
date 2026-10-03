import path from 'node:path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Permet plusieurs serveurs de développement en parallèle (NEXT_DIST_DIR=.next-xyz)
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  // Image Docker autonome (Railway) : serveur minimal, dépendances du monorepo tracées depuis la racine
  output: 'standalone',
  outputFileTracingRoot: path.join(import.meta.dirname, '../../'),
  transpilePackages: ['@hi/ui', '@hi/core', '@hi/db', '@hi/integrations'],
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'admin.hitravel.tn' }],
  },
  poweredByHeader: false,
}

export default nextConfig
