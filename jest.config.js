// Place the Babel config inline for now
module.exports = {
    // jj keeps checkouts of the repo here, e.g. for `jj run`
    modulePathIgnorePatterns: ['<rootDir>/.jj/'],
    testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.jj/'],
    transform: {
        '\\.ts$': [
            'babel-jest',
            {
                plugins: ['@babel/plugin-transform-modules-commonjs'],
                presets: ['@babel/preset-typescript'],
            },
        ],
    },
}
