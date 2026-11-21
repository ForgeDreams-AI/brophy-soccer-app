import { defineConfig } from 'vitest/config'

// Firestore + Storage security-rules tests. Run them through the emulators:
//   npm run test:rules
// (firebase emulators:exec starts firestore + storage under the demo-brophy
// project and sets FIRESTORE_EMULATOR_HOST / FIREBASE_STORAGE_EMULATOR_HOST.)
export default defineConfig({
  test: {
    include: ['test/rules/**/*.test.js'],
    environment: 'node',
    testTimeout: 20000,
    hookTimeout: 30000,
    // All files share one emulator instance; run them one at a time.
    fileParallelism: false,
  },
})
