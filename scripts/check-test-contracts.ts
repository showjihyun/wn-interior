import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOTS = ['src', 'e2e']
const TEST_FILE = /\.(?:test|spec)\.tsx?$/
const ASSERTION = /\bexpect\s*\(/
const FOCUSED_TEST = /\b(?:describe|it|test)\.only\s*\(/
const FALSE_RED_MARKER = /TDD\s+RED|아직 구현 없음/

function collectTests(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return collectTests(path)
    return TEST_FILE.test(entry.name) ? [path] : []
  })
}

const violations: string[] = []
const files = ROOTS.flatMap(collectTests)

for (const file of files) {
  const source = readFileSync(file, 'utf8')
  const label = relative(process.cwd(), file).replaceAll('\\', '/')

  if (!ASSERTION.test(source)) violations.push(`${label}: assertion(expect)이 없습니다.`)
  if (FOCUSED_TEST.test(source)) violations.push(`${label}: .only가 커밋되어 있습니다.`)
  if (FALSE_RED_MARKER.test(source)) {
    violations.push(`${label}: 주석은 RED 실행 증거가 아닙니다. 계약/회귀 테스트로 표현하세요.`)
  }
}

if (violations.length) {
  console.error(`테스트 계약 검사 실패 (${violations.length}건)`)
  for (const violation of violations) console.error(`- ${violation}`)
  process.exitCode = 1
} else {
  console.log(`테스트 계약 검사 통과: ${files.length}개 파일`)
}
