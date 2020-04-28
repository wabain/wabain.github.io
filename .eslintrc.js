module.exports = {
    extends: ['eslint:recommended', 'eslint-config-prettier'],
    parser: 'babel-eslint',
    root: true,
    env: {
        node: true,
        es6: true,
    },
    reportUnusedDisableDirectives: true,
    overrides: [
        // Source files
        {
            files: ['src/**/*.ts'],
            parser: '@typescript-eslint/parser',
            plugins: ['@typescript-eslint'],
            extends: [
                'eslint:recommended',
                'plugin:@typescript-eslint/eslint-recommended',
                'plugin:@typescript-eslint/recommended',
                'prettier/@typescript-eslint',
            ],
            parserOptions: {
                ecmaVersion: 6,
                sourceType: 'module',
            },
            env: {
                browser: true,
                node: false,
            },
            rules: {
                '@typescript-eslint/no-use-before-define': [
                    'error',
                    { functions: false },
                ],
            },
        },
        {
            files: ['src/**/*.js'],
            parserOptions: {
                ecmaVersion: 6,
                sourceType: 'module',
            },
            env: {
                browser: true,
                node: false,
            },
        },
        // Test files
        {
            files: ['**/*.test.js', '**/*.test.ts'],
            parserOptions: {
                ecmaVersion: 2017,
            },
            env: {
                jest: true,
            },
        },
    ],
}
