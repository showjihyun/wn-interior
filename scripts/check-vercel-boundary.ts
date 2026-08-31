import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const ignoreFile = resolve(root, '.vercelignore')

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

console.log('Vercel 배포 경계 통과: services/** GPU worker 제외')
