/** @type {import('jest').Config} */
const config = {
  projects: [
    {
      displayName: "node",
      preset: "ts-jest",
      testEnvironment: "node",
      testMatch: ["**/*.test.ts"],
      testPathIgnorePatterns: ["<rootDir>/.claude/worktrees/"],
      moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/$1",
        "^server-only$": "<rootDir>/jest-mocks/server-only.js",
      },
    },
    {
      displayName: "jsdom",
      preset: "ts-jest",
      testEnvironment: "<rootDir>/jest-mocks/jsdom-with-fetch.js",
      testMatch: ["**/*.test.tsx"],
      testPathIgnorePatterns: ["<rootDir>/.claude/worktrees/"],
      setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
      moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/$1",
        "^server-only$": "<rootDir>/jest-mocks/server-only.js",
        "^next/navigation$": "<rootDir>/jest-mocks/next-navigation.js",
      },
    },
  ],
};

export default config;
