import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const ignoreFile = resolve(root, '.vercelignore')
const configFile = resolve(root, 'vercel.json')
const reservedServicesDirectory = resolve(root, 'services')
const workerDirectory = resolve(root, 'workers/triposr-worker')

if (!existsSync(ignoreFile)) {
  throw new Error('.vercelignore missing: GPU worker must not enter the frontend deployment')
}

const patterns = readFileSync(ignoreFile, 'utf8')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'))

if (!patterns.includes('workers/**')) {
  throw new Error('workers/** must be excluded from the Vercel frontend deployment')
}
if (existsSync(reservedServicesDirectory)) {
  throw new Error('services/ is reserved for Vercel multi-service auto-detection')
}
if (!existsSync(workerDirectory)) {
  throw new Error('TripoSR worker must remain in workers/triposr-worker')
}

const config = JSON.parse(readFileSync(configFile, 'utf8')) as {
  buildCommand?: unknown
  outputDirectory?: unknown
  services?: unknown
}
if (
  config.services !== undefined ||
  config.buildCommand !== 'npm run build' ||
  config.outputDirectory !== 'dist'
) {
  throw new Error('Vercel must use the single Vite frontend build contract')
}

console.log('Vercel 배포 경계 통과: reserved services/ 없음·workers/** 제외')
