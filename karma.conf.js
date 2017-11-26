const KARMA_PORT = 9876

module.exports = function(config) {
    config.set({
        basePath: '',

        preprocessors: {
            'tests/main.js': ['webpack', 'sourcemap']
        },

        webpack: require('./webpack.config-lib').forTests(),

        webpackMiddleware: {
            noInfo: true
        },

        frameworks: ['mocha'],

        files: [
            { pattern: '_site/**/*', included: false, served: true },
            require.resolve('jquery'),
            'tests/main.js',
        ],

        reporters: ['mocha'],

        port: KARMA_PORT,
        proxies: {
            '/home-assets/': `http://localhost:${KARMA_PORT}/base/_site/home-assets/`,
            '/section-partial/': `http://localhost:${KARMA_PORT}/base/_site/section-partial/`,
        },

        colors: true,

        // level of logging
        // possible values: config.LOG_DISABLE || config.LOG_ERROR || config.LOG_WARN || config.LOG_INFO || config.LOG_DEBUG
        logLevel: config.LOG_INFO,

        // start these browsers
        // available browser launchers: https://npmjs.org/browse/keyword/karma-launcher
        browsers: ['Chrome'],

        concurrency: Infinity
    })
}
