import type { Config } from 'jest';

export default async (): Promise<Config> => {
  return {
    verbose: false,
    preset: 'ts-jest',
    testEnvironment: 'node',
    testPathIgnorePatterns: ['src/test.ts', 'dist/*']
  };
};