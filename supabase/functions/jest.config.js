const { join } = require('node:path');

module.exports = {
  displayName: 'supabase-functions',
  rootDir: join(__dirname, '..', '..'),
  testEnvironment: 'node',
  collectCoverage: false,
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  testMatch: [
    '<rootDir>/supabase/functions/**/__tests__/**/*.(test|spec).[tj]s?(x)',
    '<rootDir>/supabase/functions/**/*.(test|spec).[tj]s?(x)',
  ],
  collectCoverageFrom: ['<rootDir>/supabase/functions/**/*.ts'],
};
