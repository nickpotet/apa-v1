import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Vite config for the Apa kiosk frontend.
// In dev, /api is proxied to `wrangler pages dev` on :8787, which runs the real
// Cloudflare Pages Functions from /functions (same code as production).
export default defineConfig({
  base: process.env.GITHUB_PAGES_BASE ?? '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 5173,
    strictPort: true,
    host: "127.0.0.1",
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: false,
      },
    },
  },
});
