import path from 'path';
import { defineConfig } from "vitest/config";

// Node-only tests for pure logic (no Playwright/browser dependency).
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    testTimeout: 120_000,
    include: ["src/**/*.node.test.ts", "src/**/*.node.test.tsx"],
    environment: "node",
  },
});
