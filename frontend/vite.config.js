import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/ask': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/ask-stream': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/emit-docs': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/emit-reconciliation-patch': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/reconciliation-bundle': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/dataset': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/health': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
})
