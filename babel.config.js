const process = require('process')

if (process.env.NODE_ENV !== 'test')
    throw new Error('Currently only support Babel for testing')

module.exports = {
    presets: [
        [
            '@babel/preset-env',
            {
                targets: {
                    node: 'current',
                },
            },
        ],
    ],
}
