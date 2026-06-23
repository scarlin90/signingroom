/// <reference types='vitest' />
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';
import tsconfigPaths from 'vite-tsconfig-paths'; 

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/client',
  plugins: [
    angular(), 
    tsconfigPaths()
  ],
  test: {
    name: 'client',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.config.ts',
        '**/*.routes.ts',
        '**/*.server.ts',
        '**/main.ts',
        '**/environments/**',
        'public/index.js',
        'vite.config.mts',
        'eslint.config.mjs'
      ],
    setupFiles: ['src/test-setup.ts'],
    reporters: ['default'],
    reportOnFailure: true,
    coverage: {
      reportsDirectory: '../../coverage/apps/client',
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'json-summary'],
      thresholds: { lines: 88, functions: 90, branches: 69, statements: 88 },
    },
    pool: 'threads',
    clearMocks: true,
    restoreMocks: true,
  },
}));