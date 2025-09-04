// Root ESLint configuration for the monorepo
import { FlatCompat } from '@eslint/eslintrc';
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
