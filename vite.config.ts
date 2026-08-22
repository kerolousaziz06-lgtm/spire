import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Vite does not serve api/ -- those are Vercel functions in production.
    // For local work, `node ingest/devapi.mjs` runs the same handlers on
    // 3001 and this forwards to it, so the browser exercises the real
    // route rather than a mock. Harmless when nothing is listening: the
    // fetch fails and TickerFill shows its "enter by hand" message, which
    // is the same path a failed deploy would take.
    proxy: {
      '/api': { target: 'http://127.0.0.1:3001', changeOrigin: true },
    },
  },
})
