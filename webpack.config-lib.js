const path = require('path')

const StyleLintPlugin = require('stylelint-webpack-plugin')
const CopyWebpackPlugin = require('copy-webpack-plugin')
const ExtractTextPlugin = require('extract-text-webpack-plugin')
const UglifyJSPlugin = require('uglifyjs-webpack-plugin')

const DIST_PATH = local('content/home-assets')
const SOURCE_ENTRY_POINTS = {
    'cs-homepage': local('src/js/index.js')
}

module.exports.forProduction  = function () {
    const { commonRules, commonPlugins } = getCommonConfig({ isProd: true })

    return {
        output: {
            path: DIST_PATH,
            filename: '[name].min.js',
            sourceMapFilename: '[file].map',
        },
        entry: SOURCE_ENTRY_POINTS,
        devtool: 'source-map',
        module: {
            rules: commonRules,
        },
        plugins: [
            ...commonPlugins,
            getAssetCopyPlugin(),
            new UglifyJSPlugin({ sourceMap: true }),
        ]
    }
}

module.exports.forDevelopment = function () {
    const { commonRules, commonPlugins } = getCommonConfig({ isProd: false })

    return {
        output: {
            path: DIST_PATH,
            filename: '[name].js',
        },
        entry: SOURCE_ENTRY_POINTS,
        devtool: 'inline-source-map',
        module: {
            rules: commonRules,
        },
        plugins: [
            ...commonPlugins,
            getAssetCopyPlugin(),
        ]
    }
}

module.exports.forTests = function getTestConfig() {
    const { commonRules, commonPlugins } = getCommonConfig({ isProd: false })

    return {
        devtool: 'inline-source-map',
        module: {
            rules: commonRules,
        },
        plugins: commonPlugins,
    }
}

function getCommonConfig({ isProd }) {
    const extractSass = new ExtractTextPlugin({
        filename: '[name].min.css',
        disable: !isProd,
    })

    const commonRules = [
        {
            enforce: 'pre',
            test: /\.js$/,
            exclude: /node_modules/,
            use: ['eslint-loader'],
        },

        {
            test: /\.scss$/,
            use: extractSass.extract({
                use: [
                    'css-loader',
                    {
                        loader: 'sass-loader',
                        options: {
                            outputStyle: isProd ? 'compressed' : 'expanded',
                        }
                    }
                ],
                // use style-loader in development
                fallback: 'style-loader'
            })
        },
    ]

    const commonPlugins = [
        // Webpack can't see through SCSS dependencies, so lint all SCSS files
        // via glob
        new StyleLintPlugin({
            context: local('src')
        }),
        extractSass
    ]

    return { commonRules, commonPlugins }
}

function getAssetCopyPlugin() {
    return new CopyWebpackPlugin([
        // Image assets, etc.
        // TODO: Might be good to run these through image-optimization passes
        {
            context: local('src/assets'),
            from: '**/*',
            to: DIST_PATH
        },

        // Section partials
        {
            context: local('content'),
            from: '*.html',
            to: local('content/section-partial/')
        },

        // Vendored assets
        // TODO: Should be able to import these directly from source files?
        {
            context: local('node_modules/fancybox/source'),
            from: '**/*',
            to: local(DIST_PATH, 'vendor/fancybox'),
        },
        {
            context: local('node_modules/jquery/dist'),
            from: '**/*',
            to: local(DIST_PATH, 'vendor/jquery'),
        },
    ])
}

function local(...components) {
    return path.resolve(__dirname, ...components)
}
