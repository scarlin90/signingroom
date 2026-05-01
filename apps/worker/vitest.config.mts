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
				lines: 96,
				functions: 95,
				branches: 85,
				statements: 93
			}
		},
		testTimeout: 10000,
  		hookTimeout: 10000,
	},
	maxWorkers: 1,
});