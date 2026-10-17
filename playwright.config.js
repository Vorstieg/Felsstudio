import { defineConfig, devices } from '@playwright/test';

// These tests exercise browser behavior with intercepted API responses.
// Cross-origin cookies still need verification against a running Felslager service.
export default defineConfig({
	testDir: './tests/e2e',
	testMatch: ['auth.spec.js', 'shared-drafts.spec.js'],
	fullyParallel: true,
	workers: process.env.CI ? 2 : 3,
	retries: process.env.CI ? 1 : 0,
	reporter: 'list',
	use: {
		baseURL: 'http://127.0.0.1:4178',
		locale: 'en-GB',
		trace: 'retain-on-failure'
	},
	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chrome'] } },
		{ name: 'firefox', use: { ...devices['Desktop Firefox'] } },
		{ name: 'webkit', use: { ...devices['Desktop Safari'] } }
	],
	webServer: {
		command: 'npm run dev -- --host 127.0.0.1 --port 4178 --strictPort',
		url: 'http://127.0.0.1:4178',
		env: { VITE_FELSLAGER_URL: 'http://127.0.0.1:4178/api/fs' },
		reuseExistingServer: false,
		timeout: 120000
	}
});
