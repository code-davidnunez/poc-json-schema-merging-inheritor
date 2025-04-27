module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'], // Look for tests in the tests directory
  moduleNameMapper: {
    '^@src/(.*)$': '<rootDir>/src/$1', // Allow importing src files using @src alias
  },
};
