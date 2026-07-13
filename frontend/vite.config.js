import { defineConfig } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8000'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

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
  "connect-src 'self'",
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

const allowedHosts = ['frota.sirel.com.br', 'localhost', '127.0.0.1']

export default defineConfig({
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
    host: '0.0.0.0',
    port: 3000,
    watch: {
      usePolling: true,
      interval: 1000,
    },
    allowedHosts,
    proxy: apiProxy,
    cors: {
      origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'https://frota.sirel.com.br'],
      credentials: true,
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts,
    headers: productionHeaders,
    proxy: apiProxy,
  },
})
