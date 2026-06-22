import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Pure-logic unit tests (no DOM). Add environment: 'jsdom' later if needed.
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}']
  }
})
