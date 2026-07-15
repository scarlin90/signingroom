/// <reference types='vitest' />
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/client',
  plugins: [angular(), tsconfigPaths()],
  test: {
    name: 'client',
    watch: false,
    globals: true,
    clean: true,
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
      'eslint.config.mjs',
      '**/*.html',
    ],
    setupFiles: ['src/test-setup.ts'],
    reporters: ['default'],
    reportOnFailure: true,
    coverage: {
      reportsDirectory: '../../coverage/apps/client',
      provider: 'istanbul',
      reporter: ['text', 'json', 'html', 'json-summary'],
      thresholds: { lines: 85, functions: 80, branches: 75, statements: 85 },
      exclude: ['**/*.html'],
    },
    pool: 'threads',
    clearMocks: true,
    restoreMocks: true,
  },
}));
