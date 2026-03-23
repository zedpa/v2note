import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    include: ["features/**/*.test.{ts,tsx}", "shared/**/*.test.{ts,tsx}"],
    setupFiles: [],

    // 超时设置
    testTimeout: 10000,

    // 详细输出（CI 友好）
    reporters: ["verbose"],

    // 覆盖率配置
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary"],
      include: ["features/**/*.ts", "features/**/*.tsx", "shared/**/*.ts"],
      exclude: [
        "**/*.d.ts",
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/types.ts",
        "**/index.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
