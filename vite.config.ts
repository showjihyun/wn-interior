/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5173 }, // host: true → 로컬 네트워크(같은 Wi-Fi/LAN) 접속 허용
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts'],
      reporter: ['text', 'json-summary'],
      reportsDirectory: 'coverage',
      thresholds: {
        statements: 40,
        branches: 40,
        functions: 28,
        lines: 40,
        'src/engine/**': {
          statements: 80,
          branches: 80,
          functions: 75,
          lines: 80,
        },
        'src/store/**': {
          statements: 40,
          branches: 30,
          functions: 40,
          lines: 40,
        },
      },
    },
  },
})
