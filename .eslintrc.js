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
        // TypeScript files
        {
            files: ['**/*.ts'],
            parser: '@typescript-eslint/parser',
            plugins: ['@typescript-eslint'],
            extends: [
                'eslint:recommended',
                'plugin:@typescript-eslint/recommended',
                'prettier/@typescript-eslint',
            ],
            parserOptions: {
                ecmaVersion: 6,
                sourceType: 'module',
            },
            rules: {
                '@typescript-eslint/no-use-before-define': [
                    'error',
                    { functions: false },
                ],
            },
        },
        // Source files
        {
            files: ['src/**/*.ts', 'src/**/*.js'],
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
            rules: {
                '@typescript-eslint/no-var-requires': ['off'],
                '@typescript-eslint/no-use-before-define': [
                    'error',
                    { functions: false, classes: false },
                ],
            },
        },
    ],
}
