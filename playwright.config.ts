import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 300_000, // AI 推理模型可能需要较长时间
  retries: 1,
  use: {
    baseURL: "http://localhost:3000",
  },
});
