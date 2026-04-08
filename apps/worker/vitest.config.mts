import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
	test: {
		poolOptions: {
			workers: {
				wrangler: { configPath: './wrangler.jsonc' },
				isolatedStorage: false, 
			},
		},
		coverage: {
			provider: 'istanbul',
			reporter: ['text', 'html', 'clover', 'json', 'json-summary'],
			reportOnFailure: true,
			thresholds: {
				lines: 90,
				functions: 90,
				branches: 90,
				statements: 90
			}
		},
		testTimeout: 10000,
  		hookTimeout: 10000,
	},
	maxWorkers: 1,
});