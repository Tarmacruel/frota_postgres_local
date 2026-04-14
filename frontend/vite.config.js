import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || '0.0.0.0:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 80,
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
