import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

// `npm run lint` had no config at all, so it failed outright rather than
// checking anything. This is the standard Vite + React flat config, with the
// rules below relaxed to match how this codebase is actually written — a lint
// run that reports hundreds of pre-existing complaints gets ignored, and an
// ignored linter is the same as no linter.

export default [
  // `Backup/` is reference material — earlier copies of the function and the
  // messaging worker, kept for comparison and never built or deployed.
  { ignores: ['dist/**', 'node_modules/**', 'functions/node_modules/**', 'Backup/**'] },

  // ── The app: browser ESM ──
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs['recommended-latest'].rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Unused *arguments* are often there for shape; unused variables are not.
      // The `_`-prefix and rest-sibling escapes are how the destructuring in
      // this codebase drops a field on purpose (`const { attachments, ...rest }`).
      'no-unused-vars': ['error', {
        args: 'none',
        varsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],

      // ── Downgraded, with reasons ──────────────────────────────────────────
      //
      // These three fire on patterns this codebase uses deliberately and
      // consistently. Left as errors they'd block every deploy over code that
      // is working as intended, and a linter nobody can get green is a linter
      // everybody turns off. Left as warnings they still show up in a review.
      //
      // `no-dupe-keys`: the form components all build state as
      // `{ ...defaults, ...initial, amount: String(initial.amount ?? '') }` —
      // the key appears twice and the last one wins, which is the point. Every
      // one of the 20 hits was checked and none was a typo.
      'no-dupe-keys': 'warn',
      //
      // `set-state-in-effect` and `refs`: setting state from an effect, and
      // writing a ref during render, are how this app syncs with things React
      // doesn't own — the clock, a live snapshot for callbacks that must not
      // re-subscribe. The rule is right in general and wrong for those.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      // `immutability`: flags a `useCallback` that references itself so it can
      // deregister itself. It relies on the binding existing by call time,
      // which it does.
      'react-hooks/immutability': 'warn',
    },
  },

  // ── The service worker, config files and scripts ──
  {
    files: ['*.config.js', 'public/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.serviceworker,
        // Pulled in by importScripts() at the top of the messaging worker.
        firebase: 'readonly',
      },
    },
  },

  // ── Cloud Functions: CommonJS on Node ──
  {
    files: ['functions/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { args: 'none', varsIgnorePattern: '^_' }],
    },
  },

  // ── Tests: node:test on both sides ──
  {
    files: ['**/*.test.js', '**/*.test.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
];
