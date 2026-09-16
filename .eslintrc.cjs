module.exports = {
	root: true,
	extends: ['eslint:recommended', 'plugin:svelte/recommended', 'prettier'],
	parserOptions: {
		sourceType: 'module',
		ecmaVersion: 2020,
		extraFileExtensions: ['.svelte']
	},
	env: {
		browser: true,
		es2017: true,
		node: true
	},
	globals: {
		$state: 'readonly',
		$props: 'readonly',
		$derived: 'readonly',
		$effect: 'readonly',
		$inspect: 'readonly'
	},
	rules: {
		'no-unused-vars': 'off',
		'svelte/valid-compile': 'warn',
		'no-useless-escape': 'off',
		'no-undef': 'off'
	},
	overrides: [
		{
			files: ['*.ts', '*.svelte.ts'],
			parser: '@typescript-eslint/parser',
			parserOptions: {
				sourceType: 'module',
				ecmaVersion: 2022
			},
			plugins: ['@typescript-eslint'],
			extends: ['plugin:@typescript-eslint/recommended'],
			rules: {
				'@typescript-eslint/no-unused-vars': 'off',
				'@typescript-eslint/no-explicit-any': 'off'
			}
		},
		{
			files: ['*.svelte.js'],
			parser: 'espree',
			parserOptions: {
				sourceType: 'module',
				ecmaVersion: 2022
			}
		}
	]
};
