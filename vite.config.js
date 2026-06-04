import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    allowedHosts: ['aarg.dev'],
  },
  preview: {
    host: true,
    allowedHosts: ['aarg.dev'],
  },
})
