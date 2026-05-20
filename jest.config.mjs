/** @type {import('jest').Config} */
const config = {
  projects: [
    {
      displayName: "node",
      preset: "ts-jest",
      testEnvironment: "node",
      testMatch: ["**/*.test.ts"],
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
