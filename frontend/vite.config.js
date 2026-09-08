import { defineConfig, loadEnv } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

function flagEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase())
}

function parsePort(value, fallback) {
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : fallback
}

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, projectRoot, ''), ...process.env }
  const environmentName = String(env.VITE_APP_ENV || '').trim().toLowerCase()
  const isHomologation = flagEnabled(env.VITE_HOMOLOGATION)
    || ['hml', 'homologacao', 'homologation', 'staging', 'test'].includes(environmentName)
  const certificateSigningEnabled = flagEnabled(env.VITE_CERTIFICATE_SIGNING_ENABLED)
  const frontendPort = parsePort(env.VITE_FRONTEND_PORT, isHomologation ? 3010 : 3000)
  const frontendHost = env.VITE_FRONTEND_HOST || (isHomologation ? '127.0.0.1' : '0.0.0.0')
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || (isHomologation ? 'http://127.0.0.1:8010' : 'http://127.0.0.1:8000')
  const signatureAgentUrl = env.VITE_SIGNATURE_AGENT_URL || (isHomologation ? 'http://127.0.0.1:54174' : 'http://127.0.0.1:54173')
  const localOrigins = [`http://localhost:${frontendPort}`, `http://127.0.0.1:${frontendPort}`]
  const apiProxy = {
    '/api': { target: apiProxyTarget, changeOrigin: true, secure: false },
    '/docs': { target: apiProxyTarget, changeOrigin: true, secure: false },
    '/redoc': { target: apiProxyTarget, changeOrigin: true, secure: false },
    '/openapi.json': { target: apiProxyTarget, changeOrigin: true, secure: false },
  }
  const productionCsp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://*.tile.openstreetmap.org",
    "frame-src https://www.openstreetmap.org",
    `connect-src 'self'${isHomologation || certificateSigningEnabled ? ` ${signatureAgentUrl}` : ''}`,
    "worker-src 'self' blob:",
  ].join('; ')
  const productionHeaders = {
    'Cache-Control': 'no-store',
    'Content-Security-Policy': productionCsp,
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
    'Referrer-Policy': 'no-referrer',
    'Strict-Transport-Security': 'max-age=31536000',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  }
  const homologationHeaders = Object.fromEntries(
    Object.entries(productionHeaders)
      .filter(([name]) => name !== 'Strict-Transport-Security'),
  )
  const allowedHosts = ['frota.sirel.com.br', 'localhost', '127.0.0.1']

  return {
    plugins: [react()],
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.js',
      restoreMocks: true,
      fileParallelism: false,
      maxWorkers: 1,
      pool: 'vmThreads',
    },
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
      ],
    },
    resolve: {
      dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
      alias: {
        react: path.resolve(projectRoot, 'node_modules/react'),
        'react-dom': path.resolve(projectRoot, 'node_modules/react-dom'),
        'react/jsx-runtime': path.resolve(projectRoot, 'node_modules/react/jsx-runtime.js'),
        'react/jsx-dev-runtime': path.resolve(projectRoot, 'node_modules/react/jsx-dev-runtime.js'),
      },
    },
    build: {
      chunkSizeWarningLimit: 650,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/recharts')) return 'analytics-charts'
            if (id.includes('node_modules/jspdf') || id.includes('node_modules/jspdf-autotable')) return 'export-pdf'
            if (
              id.includes('node_modules/react/')
              || id.includes('node_modules/react-dom/')
              || id.includes('node_modules/react-router')
            ) return 'react-vendor'
            if (id.includes('node_modules/leaflet')) return 'maps'
            if (id.includes('node_modules/axios')) return 'api-client'
            if (id.includes('node_modules/qrcode') || id.includes('node_modules/zipcelx')) return 'export-utils'
            return undefined
          },
        },
      },
    },
    server: {
      host: frontendHost,
      port: frontendPort,
      strictPort: isHomologation,
      headers: isHomologation ? homologationHeaders : undefined,
      watch: {
        usePolling: true,
        interval: 1000,
      },
      allowedHosts,
      proxy: apiProxy,
      cors: {
        origin: [...localOrigins, 'https://frota.sirel.com.br'],
        credentials: true,
      },
    },
    preview: {
      host: frontendHost,
      port: frontendPort,
      strictPort: isHomologation,
      allowedHosts,
      headers: productionHeaders,
      proxy: apiProxy,
    },
  }
})
