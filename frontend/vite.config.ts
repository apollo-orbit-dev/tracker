import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:8011'

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: true,
      port: 5173,
      // Vite's Host-header filter blocks reverse-proxy deployments at a
      // custom hostname (403). VITE_ALLOWED_HOSTS is a comma-separated
      // list (e.g. "tracker.example.com,demo.lan"). Unset means "allow
      // any host" — fine for dev / LAN deploys; tighten in production.
      allowedHosts: env.VITE_ALLOWED_HOSTS
        ? env.VITE_ALLOWED_HOSTS.split(',').map((h) => h.trim()).filter(Boolean)
        : true,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
