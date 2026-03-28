import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom', // Required for Angular components
    coverage: {
      provider: 'v8', //
      reporter: ['text', 'json', 'html'],
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
	  reportsDirectory: './coverage/apps/client', 
      enabled: true,
      thresholds: {
        lines: 90,
        functions: 85,
        branches: 80,
        statements: 90
      }
    }
  }
});