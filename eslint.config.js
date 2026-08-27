// Baseline 정합: TS strict + react-hooks + 미사용 코드 검사
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'shots', 'test-results', 'e2e/fixtures'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // R3F imperative 3D 도메인: OrbitControls/ref 제어는 이벤트 핸들러에서의
      // 명령형 제어가 정석 (three.js API 특성). 컴파일러 기반 실험 규칙 예외 처리.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/refs': 'off',
      'react-refresh/only-export-components': 'off',
      // Baseline: 실패를 삼키지 않는다 — 빈 catch는 주석으로 사유 문서화 허용
      'no-empty': ['error', { allowEmptyCatch: true }],
      // 미사용 변수는 오류 (선 언어 수준)
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'off', // 경계 파서에서 한정 사용
    },
  }
)
