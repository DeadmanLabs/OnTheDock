module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.js', '**/*.test.ts', '**/*.spec.js', '**/*.spec.ts'],
  collectCoverageFrom: [
    'dist/**/*.js',
    '!dist/**/*.d.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testTimeout: 30000
};