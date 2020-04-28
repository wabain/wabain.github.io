// Place the Babel config inline for now
module.exports = {
    transform: {
        '\\.[jt]s$': [
            'babel-jest',
            {
                plugins: ['@babel/plugin-transform-modules-commonjs'],
                presets: ['@babel/preset-typescript'],
            },
        ],
    },
}
