/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
  // uuid v14 is ESM-only — must be transformed, not left as-is
  transformIgnorePatterns: ['node_modules/(?!(uuid)/)'],
  moduleNameMapper: {
    '^ioredis$': '<rootDir>/src/__tests__/__mocks__/ioredis.ts',
    '^uuid$':    '<rootDir>/src/__tests__/__mocks__/uuid.ts',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/db/setup.ts',
    '!src/__tests__/**',
  ],
}
