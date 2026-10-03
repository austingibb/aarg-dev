import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Lightweight production mangling/minification; source maps stay private.
  build: { minify: 'oxc', sourcemap: false },
  server: {
    allowedHosts: ['aarg.dev'],
    proxy: {
      '/api': process.env.AARG_API_TARGET || 'http://127.0.0.1:4174',
    },
  },
  preview: {
    host: true,
    allowedHosts: ['aarg.dev'],
  },
})
