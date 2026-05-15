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
      testEnvironment: "jsdom",
      testMatch: ["**/*.test.tsx"],
      moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/$1",
        "^server-only$": "<rootDir>/jest-mocks/server-only.js",
      },
    },
  ],
};

export default config;
