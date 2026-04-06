/// <reference types='vitest' />
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/client',
  plugins: [angular(), nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  test: {
    name: 'client',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    setupFiles: ['src/test-setup.ts'],
    reporters: ['default'],
    reportOnFailure: true,
    coverage: {
      reportsDirectory: '../../coverage/apps/client',
      provider: 'v8' as const,
      reporter: ['text', 'json', 'html', 'json-summary'], 
      thresholds: {
        lines: 88,
        functions: 90,
        branches: 69,
        statements: 88
      },
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
    },
    pool: 'threads',
    poolOptions: {
      threads: { singleThread: false }
    },
  },
}));
