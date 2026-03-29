import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  retries: 1,
  use: {
    baseURL: "http://localhost:3000",
  },
});
