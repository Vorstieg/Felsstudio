import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { enhancedImages } from '@sveltejs/enhanced-img';
import { svelteTesting } from '@testing-library/svelte/vite';

const config = defineConfig({
	plugins: [tailwindcss(), enhancedImages(), sveltekit(), svelteTesting()],
	assetsInclude: ['**/*.glb'],
	server: {
		fs: {
			allow: ['.']
		}
	},

	optimizeDeps: {
		exclude: ['three', 'd3-zoom', 'd3-selection']
	},

	test: {
		environment: 'jsdom',
		setupFiles: ['./vitest-setup.js'],
		include: ['src/**/*.test.{js,ts}', 'tests/test-*.mjs']
	}
});

export default config;
