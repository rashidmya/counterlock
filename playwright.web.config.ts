import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/web-browser",
  use: {
    baseURL: "http://127.0.0.1:5187",
    viewport: { width: 1260, height: 900 },
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
  },
  webServer: {
    command: "npm run web:build && npm run web:preview",
    url: "http://127.0.0.1:5187",
    reuseExistingServer: false,
  },
});
