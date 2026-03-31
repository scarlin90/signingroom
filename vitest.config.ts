import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom', // Required for Angular components
    coverage: {
      provider: 'v8', //
      reporter: ['text', 'json', 'html', 'json-summary'],
      // Exclude setup files and configuration from coverage
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.config.ts',
        '**/*.routes.ts',
        '**/*.server.ts',
        '**/main.ts',
        '**/environments/**',
      ],
  }
});