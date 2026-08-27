// 프로덕션 빌드(vite preview) 대상 스모크 — 미니파이 번호 런타임 검증
import base from './playwright.config'
import { defineConfig } from '@playwright/test'

export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: '**/preview.smoke.spec.ts',
  use: {
    ...base.use,
    baseURL: 'http://localhost:4173',
  },
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
