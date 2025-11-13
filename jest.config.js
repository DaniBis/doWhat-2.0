// Root Jest config aggregating subprojects. Use explicit per-project configs.
module.exports = {
  projects: [
    '<rootDir>/apps/doWhat-mobile/jest.config.js',
    '<rootDir>/apps/doWhat-web/jest.config.js',
    '<rootDir>/packages/shared/jest.config.js'
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
