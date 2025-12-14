// ESLint config for mobile app
import { FlatCompat } from '@eslint/eslintrc';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import pluginReact from 'eslint-plugin-react';
import pluginReactHooks from 'eslint-plugin-react-hooks';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: { extends: 'eslint:recommended' },
});

export default [
  {
    ignores: ['app_backup/**', 'android/**', 'ios/**', 'Pods/**', '.expo/**', 'build/**'],
  },
  ...compat.extends('plugin:@typescript-eslint/recommended'),
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    plugins: { react: pluginReact, 'react-hooks': pluginReactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    ignores: ['**/__tests__/**', '**/*.test.ts', '**/*.test.tsx', '**/setupTests.ts'],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: __dirname,
      },
    },
  },
];