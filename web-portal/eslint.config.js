import { existsSync, readdirSync } from 'node:fs';

import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Restricted-import patterns enforcing the architecture boundaries
 * (docs/frontend/FRONTEND-ARCHITECTURE.md §14).
 * Overrides below re-allow each import exactly where it is owned.
 */
const restrictedImportPatterns = {
  featureDeepImports: {
    group: ['@/features/*/*', '@/features/*/**'],
    message:
      'Features are consumed only via their public surface: import from "@/features/<name>".',
  },
  radix: {
    group: ['@radix-ui/*'],
    message:
      'Radix/shadcn primitives are wrapped and restyled in shared/components/ui — import the wrapper instead.',
  },
  axios: {
    group: ['axios'],
    message: 'All HTTP goes through shared/api (the single Axios boundary).',
  },
  testing: {
    // Test packages AND the app's own test-only modules: production code must
    // not reach either, or the bundle pulls in the runner and the fixtures.
    group: [
      'vitest',
      'vitest/*',
      '@testing-library/*',
      'msw',
      'msw/*',
      '@/shared/testing',
      '@/shared/testing/*',
      '@/shared/testing/**',
    ],
    message:
      'Test-only dependency: keep it in *.test.* files or the testing/fixture modules — it must never be reachable from the production bundle.',
  },
};

const allRestrictedPatterns = [
  restrictedImportPatterns.featureDeepImports,
  restrictedImportPatterns.radix,
  restrictedImportPatterns.axios,
  restrictedImportPatterns.testing,
];

/**
 * Modules that legitimately import test tooling: the test files themselves,
 * the shared testing helpers, and per-feature fixture modules (`test-support`).
 * Nothing under these globs may be imported by application code.
 */
const testGlobs = [
  'src/**/*.test.{ts,tsx}',
  'src/shared/testing/**/*.{ts,tsx}',
  'src/**/test-support.{ts,tsx}',
];

/**
 * Boundary 1 — "a feature never imports another feature" — enforced
 * generically: one zone per feature folder, generated from the directory
 * listing, so the rule is live the moment the first two features exist.
 */
function featureIsolationZones() {
  const featuresDir = new URL('./src/features', import.meta.url).pathname;
  if (!existsSync(featuresDir)) return [];
  return readdirSync(featuresDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      target: `./src/features/!(${entry.name})/**/*`,
      from: `./src/features/${entry.name}`,
      message: `Feature "${entry.name}" may only be imported via shared/ promotion or by app/ through its index.ts.`,
    }));
}

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', 'scripts'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, prettier],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
      import: importPlugin,
    },
    settings: {
      'import/resolver': {
        typescript: {
          project: ['./tsconfig.app.json', './tsconfig.node.json'],
        },
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],

      // Layer boundaries (ESLint-enforced; violations are defects):
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: './src/shared',
              from: './src/features',
              message: 'shared/* must never import from features/*.',
            },
            {
              target: './src/shared',
              from: './src/app',
              message: 'shared/* must never import from app/*.',
            },
            {
              target: './src/features',
              from: './src/app',
              message: 'features must never import from app/*.',
            },
            {
              target: './src/config',
              from: ['./src/app', './src/features', './src/shared'],
              message: 'config is a leaf layer — it imports nothing from the app.',
            },
            ...featureIsolationZones(),
          ],
        },
      ],
      'no-restricted-imports': ['error', { patterns: allRestrictedPatterns }],

      // Only src/config/env.ts reads import.meta.env.
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.type='MetaProperty'][property.name='env']",
          message: 'Read import.meta.env only through src/config/env.ts.',
        },
      ],
    },
  },
  {
    // The API boundary owns Axios — it drops only that restriction.
    files: ['src/shared/api/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            restrictedImportPatterns.featureDeepImports,
            restrictedImportPatterns.radix,
            restrictedImportPatterns.testing,
          ],
        },
      ],
    },
  },
  {
    // The wrapped-primitive layer owns Radix imports — and nothing else.
    files: ['src/shared/components/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            restrictedImportPatterns.featureDeepImports,
            restrictedImportPatterns.axios,
            restrictedImportPatterns.testing,
          ],
        },
      ],
    },
  },
  {
    // The single import.meta.env reader.
    files: ['src/config/env.ts', 'src/vite-env.d.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    // Tests run in a Node-flavored jsdom world and own the test tooling.
    files: testGlobs,
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      'react-refresh/only-export-components': 'off',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // Tests may reach a feature's fixture module — and nothing else
              // behind its public surface.
              group: ['@/features/*/*', '@/features/*/**', '!@/features/*/test-support'],
              message: restrictedImportPatterns.featureDeepImports.message,
            },
            restrictedImportPatterns.radix,
          ],
        },
      ],
    },
  },
  {
    // Build/test tooling configs legitimately import the test runner.
    files: ['*.config.{ts,js}', 'vite.config.ts', 'eslint.config.js'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  {
    // Context/provider modules legitimately export a component plus its hooks
    // (and cva modules a component plus its variants) — fast-refresh purity
    // does not apply to them.
    files: [
      'src/shared/auth/identity.tsx',
      'src/shared/auth/session.tsx',
      'src/shared/theme/ThemeProvider.tsx',
      'src/app/dev/DevIdentityProvider.tsx',
      'src/shared/components/ui/Button.tsx',
      'src/shared/components/ui/Input.tsx',
      'src/shared/components/ConfirmActionDialog.tsx',
      'src/shared/components/StatusBadge.tsx',
      'src/features/auth/AuthProvider.tsx',
    ],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
);
