module.exports = {
    extends: ['eslint:recommended', 'prettier'],
    parser: '@babel/eslint-parser',
    root: true,
    env: {
        node: true,
        es6: true,
    },
    parserOptions: {
        requireConfigFile: false,
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
                'plugin:@typescript-eslint/recommended-requiring-type-checking',
            ],
            parserOptions: {
                ecmaVersion: 6,
                sourceType: 'module',
                project: ['tsconfig.json', 'integration-tests/tsconfig.json'],
                tsconfigRootDir: __dirname,
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
