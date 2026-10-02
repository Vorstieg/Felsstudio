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
		'no-unused-vars': ['error', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
		'svelte/valid-compile': 'warn',
		'no-useless-escape': 'off',
		'no-undef': 'off'
	},
	overrides: [
		{
			files: ['*.svelte'],
			parserOptions: {
				parser: {
					ts: '@typescript-eslint/parser',
					typescript: '@typescript-eslint/parser',
					js: 'espree'
				}
			}
		},
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
				'no-unused-vars': 'off',
				'@typescript-eslint/no-unused-vars': [
					'error',
					{ argsIgnorePattern: '^_', ignoreRestSiblings: true }
				],
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
