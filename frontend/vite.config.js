import { defineConfig } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8000'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    restoreMocks: true,
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
    allowedHosts: true,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
        secure: false,
      },
      '/docs': {
        target: apiProxyTarget,
        changeOrigin: true,
        secure: false,
      },
      '/redoc': {
        target: apiProxyTarget,
        changeOrigin: true,
        secure: false,
      },
      '/openapi.json': {
        target: apiProxyTarget,
        changeOrigin: true,
        secure: false,
      },
    },
    cors: {
      origin: '*',
      credentials: true,
    },
  },
})
