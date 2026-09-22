const tseslint = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');

// The CommonJS scripts and test harnesses are ordinary Node modules rather than workspace sources,
// so they are checked with core rules only: adding a globals package for them would mean a runtime
// dependency change for lint-only coverage.
const nodeGlobals = {
  Buffer: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  clearInterval: 'readonly',
  clearTimeout: 'readonly',
  console: 'readonly',
  exports: 'writable',
  module: 'writable',
  process: 'readonly',
  require: 'readonly',
  setInterval: 'readonly',
  setTimeout: 'readonly',
  structuredClone: 'readonly',
};

module.exports = [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '.vscode-test/**'],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: true,
        tsconfigRootDir: __dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: nodeGlobals,
    },
    rules: {
      eqeqeq: 'error',
      'no-undef': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      'no-unused-vars': 'error',
      'no-var': 'error',
      // Cleanup closures registered before the value exists read it first on purpose, which the
      // rule's default treats as a missed const.
      'prefer-const': ['error', { ignoreReadBeforeAssign: true }],
    },
  },
];
