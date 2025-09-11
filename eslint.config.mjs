// Root ESLint configuration for the monorepo
import { FlatCompat } from '@eslint/eslintrc';
import pluginReact from 'eslint-plugin-react';
import pluginReactHooks from 'eslint-plugin-react-hooks';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: { extends: "eslint:recommended" }
});

export default [
  // Global ignores for build artifacts and generated files
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/build/**',
      '**/coverage/**',
  '**/app_backup/**',
      '**/*.config.js',
      '**/*.config.mjs',
      '**/vendor-chunks/**',
      '**/webpack-runtime.js',
      '**/polyfills.js',
      '**/next-env.d.ts',
      '**/.expo/**',
      '**/android/**',
      '**/ios/**',
      '**/Pods/**',
      '**/*.d.ts',
      '**/*webpack*',
      '**/chunks/**',
      '**/static/**',
      '**/server/**'
    ]
  },
  ...compat.extends('plugin:@typescript-eslint/recommended'),
  // React/Next.js tweaks for React 17+ (no need to import React in scope for JSX)
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: {
      react: pluginReact,
      'react-hooks': pluginReactHooks,
    },
    settings: {
  react: { version: 'detect' },
    },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',
  // Too noisy for now; we can gradually tighten later
  '@typescript-eslint/no-explicit-any': 'warn',
  '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/build/**',
      '**/coverage/**',
      '**/vendor-chunks/**',
      '**/webpack-runtime.js',
      '**/polyfills.js',
      '**/next-env.d.ts',
      '**/.expo/**',
      '**/android/**',
      '**/ios/**',
      '**/Pods/**',
      '**/*.d.ts',
      '**/*webpack*',
      '**/chunks/**',
      '**/static/**',
      '**/server/**'
    ],
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: __dirname,
      },
    },
  },
];
