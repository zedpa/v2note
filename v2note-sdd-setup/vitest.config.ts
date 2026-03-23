import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    // 测试文件匹配模式
    include: ['__tests__/**/*.test.ts', '__tests__/**/*.test.tsx'],
    
    // 环境
    environment: 'node',
    
    // 路径别名（与 tsconfig 一致）
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@tests': path.resolve(__dirname, './__tests__'),
    },
    
    // 全局 setup（可选，用于数据库等）
    // globalSetup: './__tests__/setup.ts',
    
    // 覆盖率配置
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.test.ts',
        'src/**/types.ts',
      ],
      // 最低覆盖率门槛
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      },
    },
    
    // 超时设置
    testTimeout: 10000,
    
    // 报告格式（CI 友好）
    reporters: ['verbose'],
  },
})
