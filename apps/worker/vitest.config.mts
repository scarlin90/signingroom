import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: {
				configPath: './wrangler.jsonc',
			},
		}),
	],
	test: {
		pool: 'threads',

		coverage: {
			provider: 'istanbul',
			reporter: ['text', 'html', 'clover', 'json', 'json-summary'],
			reportOnFailure: true,
			thresholds: {
				lines: 95,
				functions: 95,
				branches: 85,
				statements: 93,
			},
		},
		testTimeout: 10000,
		hookTimeout: 10000,
	},
});
