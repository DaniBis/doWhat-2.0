// ESLint config for web app (extends root, project-aware)
import pluginReact from 'eslint-plugin-react';
import pluginReactHooks from 'eslint-plugin-react-hooks';
import nextPlugin from '@next/eslint-plugin-next';

export default [
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    plugins: { react: pluginReact, 'react-hooks': pluginReactHooks, '@next/next': nextPlugin },
    settings: { react: { version: 'detect' } },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',
      '@next/next/no-img-element': 'off', // allow raw img in controlled components
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/__tests__/**/*.{ts,tsx,js,jsx}', '**/*.test.{ts,tsx,js,jsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
