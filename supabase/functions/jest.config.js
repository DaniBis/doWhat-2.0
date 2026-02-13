module.exports = {
  displayName: 'supabase-functions',
  rootDir: __dirname,
  testEnvironment: 'node',
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  testMatch: [
    '<rootDir>/**/__tests__/**/*.(test|spec).[tj]s?(x)',
    '<rootDir>/**/*.(test|spec).[tj]s?(x)',
  ],
  collectCoverageFrom: ['<rootDir>/**/*.ts'],
};
