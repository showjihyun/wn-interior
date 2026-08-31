/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { createGeneratedMeshE2EFixture } from './scripts/generated-mesh-fixture.ts'
import { loadLocalMeshReview, localMeshReviewPlugin } from './scripts/local-mesh-review.ts'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const testMesh = mode === 'test' ? createGeneratedMeshE2EFixture() : null
  const localReview =
    mode === 'development' &&
    env.VITE_ENABLE_LOCAL_MESH_REVIEW === 'true' &&
    env.VITE_LOCAL_MESH_REVIEW_RECORD
      ? loadLocalMeshReview(process.cwd(), env.VITE_LOCAL_MESH_REVIEW_RECORD)
      : null
  return {
    plugins: [react(), localMeshReviewPlugin(localReview)],
    define: {
      'import.meta.env.VITE_E2E_MESH_FIXTURE_PAYLOAD': JSON.stringify(
        testMesh ? JSON.stringify({ product: testMesh.product, manifest: testMesh.manifest }) : ''
      ),
      'import.meta.env.VITE_LOCAL_MESH_REVIEW_PAYLOAD': JSON.stringify(
        localReview ? JSON.stringify(localReview.asset) : ''
      ),
    },
    server: { host: true, port: 5173 }, // host: true → 로컬 네트워크(같은 Wi-Fi/LAN) 접속 허용
    build: {
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined
            if (/node_modules[\\/](?:read-excel-file|fflate|saxen|worker-f)[\\/]/.test(id)) {
              return 'catalog-xlsx'
            }
            if (id.includes('/three/') || id.includes('\\three\\')) return 'vendor-three'
            if (
              id.includes('@react-three') ||
              id.includes('three-stdlib') ||
              id.includes('@use-gesture')
            ) {
              return 'vendor-r3f'
            }
            if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('scheduler')) {
              return 'vendor-react'
            }
            return 'vendor-misc'
          },
        },
      },
    },
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
          'src/domain/engine/**': {
            statements: 80,
            branches: 80,
            functions: 75,
            lines: 80,
          },
          'src/presentation/state/**': {
            statements: 55,
            branches: 40,
            functions: 55,
            lines: 60,
          },
          'src/presentation/texture/**': {
            statements: 35,
            branches: 40,
            functions: 40,
            lines: 40,
          },
          'src/application/**': {
            statements: 85,
            branches: 65,
            functions: 85,
            lines: 90,
          },
          'src/infrastructure/**': {
            statements: 65,
            branches: 50,
            functions: 65,
            lines: 70,
          },
        },
      },
    },
  }
})
