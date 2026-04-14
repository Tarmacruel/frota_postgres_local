import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const rawProxyTarget = (process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8000').trim()
const apiProxyTarget = /^https?:\/\//i.test(rawProxyTarget) ? rawProxyTarget : `http://${rawProxyTarget}`

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5175,
    allowedHosts: ['frota.sirel.com.br', 'www.sirel.com.br', 'localhost', '127.0.0.1'],
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      '/docs': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      '/redoc': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      '/openapi.json': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
})
