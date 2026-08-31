import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const ignoreFile = resolve(root, '.vercelignore')
const configFile = resolve(root, 'vercel.json')

if (!existsSync(ignoreFile)) {
  throw new Error('.vercelignore missing: GPU worker must not enter the frontend deployment')
}

const patterns = readFileSync(ignoreFile, 'utf8')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'))

if (!patterns.includes('services/**')) {
  throw new Error('services/** must be excluded from the Vercel frontend deployment')
}

const config = JSON.parse(readFileSync(configFile, 'utf8')) as {
  buildCommand?: unknown
  outputDirectory?: unknown
  services?: Record<
    string,
    { root?: unknown; framework?: unknown; buildCommand?: unknown; outputDirectory?: unknown }
  >
}
if (config.buildCommand !== undefined || config.outputDirectory !== undefined) {
  throw new Error('Vercel multi-service detection forbids ambiguous top-level build settings')
}
const serviceNames = Object.keys(config.services ?? {})
if (serviceNames.length !== 1 || serviceNames[0] !== 'frontend') {
  throw new Error('Vercel deployment must declare only the frontend service')
}
const frontend = config.services?.frontend
if (
  frontend?.root !== '.' ||
  frontend.framework !== 'vite' ||
  frontend.buildCommand !== 'npm run build' ||
  frontend.outputDirectory !== 'dist'
) {
  throw new Error('Vercel frontend service build contract mismatch')
}

console.log('Vercel 배포 경계 통과: services/** GPU worker 제외')
