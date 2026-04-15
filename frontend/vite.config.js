import { defineConfig } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8000'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      react: path.resolve(projectRoot, 'node_modules/react'),
      'react-dom': path.resolve(projectRoot, 'node_modules/react-dom'),
    },
  },
  build: {
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/recharts')) return 'analytics-charts'
          if (id.includes('node_modules/jspdf') || id.includes('node_modules/jspdf-autotable')) return 'export-pdf'
          return undefined
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
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
