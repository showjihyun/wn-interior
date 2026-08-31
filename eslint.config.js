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
  },
  {
    files: ['src/domain/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-*', 'zustand', 'three', '@react-three/*'],
              message: '도메인 레이어는 UI/렌더링 프레임워크를 참조할 수 없습니다.',
            },
            {
              group: [
                '**/application/**',
                '**/infrastructure/**',
                '**/ui/**',
                '**/scene/**',
                '**/store/**',
              ],
              message: '도메인 레이어는 바깥 레이어를 참조할 수 없습니다.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: '네트워크 호출은 인프라 어댑터로 이동하세요.' },
        { name: 'localStorage', message: '저장소 접근은 인프라 어댑터로 이동하세요.' },
        { name: 'document', message: 'DOM 접근은 프레젠테이션/인프라로 이동하세요.' },
        { name: 'window', message: '브라우저 전역은 프레젠테이션/인프라로 이동하세요.' },
      ],
    },
  },
  {
    files: ['src/application/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-*', 'zustand', 'three', '@react-three/*'],
              message: '애플리케이션 레이어는 UI/렌더링 프레임워크를 참조할 수 없습니다.',
            },
            {
              group: ['**/infrastructure/**', '**/ui/**', '**/scene/**', '**/store/**'],
              message: '애플리케이션 레이어는 바깥 레이어를 참조할 수 없습니다.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: '네트워크 호출은 포트 뒤 인프라 어댑터로 이동하세요.' },
        { name: 'localStorage', message: '저장소 접근은 포트 뒤 인프라 어댑터로 이동하세요.' },
        { name: 'document', message: 'DOM 접근은 바깥 레이어로 이동하세요.' },
        { name: 'window', message: '브라우저 전역은 바깥 레이어로 이동하세요.' },
      ],
    },
  },
  {
    files: ['src/presentation/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/infrastructure/**', '**/compositionRoot'],
              message: '프레젠테이션은 구체 인프라 대신 조립된 포트/유스케이스를 사용하세요.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/infrastructure/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/presentation/**', '**/ui/**', '**/scene/**', '**/store/**'],
              message: '인프라 레이어는 프레젠테이션을 참조할 수 없습니다.',
            },
          ],
        },
      ],
    },
  }
)
