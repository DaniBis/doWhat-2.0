module.exports = {
  projects: [
    '<rootDir>/apps/doWhat-mobile',
    '<rootDir>/apps/doWhat-web',
    '<rootDir>/packages/shared/jest.config.cjs'
  ],
  collectCoverage: true,
  coverageDirectory: '<rootDir>/coverage',
  collectCoverageFrom: [
    'apps/*/src/**/*.{js,jsx,ts,tsx}',
    'packages/*/src/**/*.{js,ts}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/coverage/**'
  ],
  coverageReporters: ['text', 'lcov', 'html'],
  verbose: true
};