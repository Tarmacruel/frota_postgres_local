import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8000'
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
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
      origin: "*",
      credentials: true
    }
  },
})
