// ESLint config for web app (extends root, project-aware)
import pluginReact from 'eslint-plugin-react';
import pluginReactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    plugins: { react: pluginReact, 'react-hooks': pluginReactHooks },
  settings: { react: { version: 'detect' } },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',
    },
  },
];
