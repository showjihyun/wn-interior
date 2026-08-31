import { describe, expect, it } from 'vitest'

type Layer = 'domain' | 'application' | 'infrastructure' | 'presentation' | 'composition'

const sources = import.meta.glob('/src/**/*.{ts,tsx,js,jsx,mts,cts}', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

function layerOf(path: string): Layer | undefined {
  if (path.includes('/domain/')) return 'domain'
  if (path.includes('/application/')) return 'application'
  if (path.includes('/infrastructure/')) return 'infrastructure'
  if (path.includes('/presentation/')) return 'presentation'
  if (path.endsWith('/compositionRoot.ts')) return 'composition'
  if (path.endsWith('/main.tsx')) return 'composition'
  return undefined
}

function normalize(path: string): string {
  const parts: string[] = []
  for (const part of path.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return `/${parts.join('/')}`
}

function resolveImport(source: string, specifier: string): string {
  if (!specifier.startsWith('.')) return specifier
  const directory = source.slice(0, source.lastIndexOf('/'))
  return normalize(`${directory}/${specifier}`).replace(/\.(js|jsx)$/, '')
}

function importSpecifiers(source: string): string[] {
  const staticImports = [
    ...source.matchAll(/(?:import|export)\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g),
  ]
  const dynamicImports = [...source.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)]
  const requires = [...source.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g)]
  return [...staticImports, ...dynamicImports, ...requires].map((match) => match[1])
}

describe('클린 아키텍처 의존성 정책', () => {
  it('안쪽 레이어가 바깥쪽 구현을 참조하지 않는다', () => {
    const violations: string[] = []
    const allowed: Record<Layer, Layer[]> = {
      domain: ['domain'],
      application: ['domain', 'application'],
      infrastructure: ['domain', 'application', 'infrastructure'],
      presentation: ['domain', 'application', 'presentation'],
      composition: ['domain', 'application', 'infrastructure', 'presentation', 'composition'],
    }

    for (const [path, source] of Object.entries(sources)) {
      if (path.endsWith('.test.ts') || path.endsWith('.test.tsx')) continue
      if (path.includes('/architecture/')) continue
      const layer = layerOf(path)
      if (!layer) {
        violations.push(`${path}: production source is not assigned to a layer`)
        continue
      }

      for (const specifier of importSpecifiers(source)) {
        const target = resolveImport(path, specifier)
        if (!target.startsWith('/src/')) {
          if ((layer === 'domain' || layer === 'application') && !specifier.startsWith('.')) {
            violations.push(`${path}: ${layer} -> external '${specifier}'`)
          }
          continue
        }
        const targetLayer = layerOf(target) ?? layerOf(`${target}.ts`) ?? layerOf(`${target}.tsx`)
        if (!targetLayer) {
          violations.push(`${path}: target '${specifier}' is not assigned to a layer`)
        } else if (!allowed[layer].includes(targetLayer)) {
          violations.push(`${path}: ${layer} -> ${targetLayer} '${specifier}'`)
        }
      }

      if (layer === 'domain' || layer === 'application') {
        const forbidden = [
          ['localStorage', /\blocalStorage\b/],
          ['fetch', /\bfetch\s*\(/],
          ['document', /\bdocument\./],
          ['window', /\bwindow\./],
        ] as const
        for (const [name, pattern] of forbidden) {
          if (pattern.test(source)) violations.push(`${path}: ${layer} uses ${name}`)
        }
      }
    }

    expect(violations, violations.join('\n')).toEqual([])
  })

  it('레거시 우회 진입점을 공개하지 않는다', () => {
    const legacyEntrypoints = ['/src/types.ts', '/src/storage/storage.ts', '/src/ai/client.ts']
    expect(Object.keys(sources).filter((path) => legacyEntrypoints.includes(path))).toEqual([])
  })
})
