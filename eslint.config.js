const { defineConfig } = require('eslint/config')
const js = require('@eslint/js')
const prettier = require('eslint-config-prettier/flat')
const globals = require('globals')
const tseslint = require('typescript-eslint')

module.exports = defineConfig([
    {
        ignores: [
            // jj keeps checkouts of the repo here, e.g. for `jj run`
            '.jj/',
            'vendor/bundle/',
            '_site/',
            'content/home-assets/',
        ],
    },
    {
        files: ['**/*.ts'],
    },
    {
        linterOptions: {
            reportUnusedDisableDirectives: 'error',
        },
    },
    js.configs.recommended,
    {
        ignores: ['src/**'],
        languageOptions: {
            globals: globals.node,
        },
    },
    {
        files: ['**/*.js'],
        languageOptions: {
            sourceType: 'commonjs',
        },
    },
    // TypeScript files
    {
        files: ['**/*.ts'],
        extends: [tseslint.configs.recommendedTypeChecked],
        languageOptions: {
            parserOptions: {
                project: ['tsconfig.json', 'integration-tests/tsconfig.json'],
                tsconfigRootDir: __dirname,
            },
        },
        rules: {
            '@typescript-eslint/no-use-before-define': [
                'error',
                { functions: false },
            ],

            '@typescript-eslint/consistent-type-imports': ['error'],

            // Rules which limit different uses of `any`; seems better to
            // just not use it unnecessarily. We do keep `no-unsafe-return`;
            // in that case an explicit cast probably makes sense.
            '@typescript-eslint/no-unsafe-assignment': ['off'],
            '@typescript-eslint/no-unsafe-member-access': ['off'],
            '@typescript-eslint/no-unsafe-call': ['off'],
        },
    },
    // Source files
    {
        files: ['src/**/*.ts', 'src/**/*.js'],
        languageOptions: {
            ecmaVersion: 2015,
            sourceType: 'module',
            globals: globals.browser,
        },
    },
    // Test files
    {
        files: ['**/*.test.js', '**/*.test.ts'],
        languageOptions: {
            ecmaVersion: 2017,
            globals: globals.jest,
        },
        rules: {
            '@typescript-eslint/no-require-imports': ['off'],
            '@typescript-eslint/no-use-before-define': [
                'error',
                { functions: false, classes: false },
            ],
        },
    },
    prettier,
])
