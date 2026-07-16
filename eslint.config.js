import eslint from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default [
  {
    ignores: [
      'backend/**',
      'dist/**',
      'node_modules/**',
      'temp/**',
      'test-results/**',
    ],
  },
  {
    files: ['**/*.{js,mjs,ts}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.serviceworker,
      },
    },
    rules: {
      ...eslint.configs.recommended.rules,
      'no-unused-vars': 'off',
      'no-undef': 'off',
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-script-url': 'error',
      'no-throw-literal': 'error',
      'no-var': 'error',
      'preserve-caught-error': 'off',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },
  {
    files: ['**/*.test.{js,mjs,ts}'],
    rules: {
      'no-script-url': 'off',
    },
  },
]
