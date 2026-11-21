import { defineConfig } from 'vitest/config'

// Unit tests for pure client helpers (src/**/*.test.js[x]). Security-rules
// tests live in test/rules and run against the emulators through
// vitest.rules.config.js (npm run test:rules).
export default defineConfig({
  test: {
    include: ['src/**/*.test.{js,jsx}'],
    environment: 'node',
    passWithNoTests: true,
  },
})
