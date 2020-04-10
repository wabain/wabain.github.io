module.exports = {
    extends: ['eslint:recommended', 'eslint-config-prettier'],
    parser: 'babel-eslint',
    root: true,
    env: {
        node: true,
        es6: true,
    },
    overrides: [
        // Source files
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
            files: ['integration-tests/**/*.js'],
            parserOptions: {
                ecmaVersion: 2017,
            },
            env: {
                es6: true,
                mocha: true,
            },
        },
    ],
}
