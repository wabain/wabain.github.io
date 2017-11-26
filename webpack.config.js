var webpackConfig = require('./webpack.config-lib')

module.exports = process.env.JEKYLL_ENV === 'production' ?
    webpackConfig.forProduction() :
    webpackConfig.forDevelopment()
