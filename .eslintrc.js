/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2023,
    sourceType: "module",
    project: false,
  },
  plugins: ["@typescript-eslint", "react", "react-hooks", "import"],
  extends: [
    "next/core-web-vitals",              // works fine for Next.js 14
    "plugin:@typescript-eslint/recommended",
  ],
  settings: {
    react: { version: "detect" },
  },
  env: {
    browser: true,
    node: true,
    es2021: true,
  },
  rules: {
    // sensible defaults; we can tighten later
    "react/react-in-jsx-scope": "off",
    "@typescript-eslint/no-explicit-any": "warn",
    "import/order": ["warn", { "newlines-between": "always", alphabetize: { order: "asc", caseInsensitive: true } }],
  },
  ignorePatterns: ["packages/shared/**/*"],
  overrides: [
    // Node-only files (configs, scripts)
    {
      files: ["**/*.{cjs,mjs,js}"],
      env: { node: true },
    },
    // We can relax rules for RN until we add react-native plugin
    {
      files: ["apps/doWhat-mobile/**/*"],
      rules: {
        "import/no-unresolved": "off",
      },
    },
  ],
};