const path = require('path')

const webpack = require('webpack')
const { CleanWebpackPlugin } = require('clean-webpack-plugin')
const CopyWebpackPlugin = require('copy-webpack-plugin')
const CssExtractPlugin = require('mini-css-extract-plugin')
const ESLintPlugin = require('eslint-webpack-plugin')
const svgToDataURI = require('mini-svg-data-uri')
const { optimize: optimizeSvg } = require('svgo')

const commonEnv = require('./webpack/common-env')

const IS_PROD = commonEnv.JEKYLL_ENV === 'production'
const DIST_PATH = local('content/home-assets')

const prodOutput = {
    path: DIST_PATH,
    publicPath: '/home-assets/',
    filename: '[name].min.js',
    sourceMapFilename: '[file].map',
}

const devOutput = {
    path: DIST_PATH,
    publicPath: '/home-assets/',
    filename: '[name].js',
}

const { rule: cssLoadRule, plugin: cssLoadPlugin } = getCssLoadConfig()

/**
 * @type import("webpack").Configuration
 */
module.exports = {
    mode: IS_PROD ? 'production' : 'development',
    output: IS_PROD ? prodOutput : devOutput,
    entry: {
        'cs-homepage': local('src/js/index.ts'),
    },
    resolve: {
        extensions: ['.ts', '.js'],
    },
    devtool: IS_PROD ? 'source-map' : 'inline-source-map',
    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                loader: 'ts-loader',
                options: {
                    compilerOptions: {
                        noEmit: false,
                    },
                },
            },

            {
                test: /\.scss$/,
                use: [
                    ...cssLoadRule,
                    {
                        loader: 'css-loader',
                        options: { importLoaders: 1, sourceMap: true },
                    },
                    { loader: 'postcss-loader', options: { sourceMap: true } },
                    { loader: 'sass-loader', options: { sourceMap: true } },
                ],
            },

            {
                test: /\.svg$/,
                include: [local('src/buildtime-assets')],
                type: 'asset/inline',
                generator: {
                    dataUrl: (content) => {
                        content = content.toString()

                        if (IS_PROD) {
                            content = optimizeSvg(content, {
                                multipass: true,
                            }).data
                        }

                        return svgToDataURI(content)
                    },
                },
            },
        ],
    },
    externals: {
        '@sentry/browser': 'Sentry',
    },
    plugins: [
        new ESLintPlugin({ extensions: ['js', 'ts'] }),
        new CleanWebpackPlugin(),
        new CopyWebpackPlugin({
            patterns: [
                // Image assets, etc.
                // TODO: Might be good to run these through image-optimization passes
                {
                    context: local('src/assets'),
                    from: '**/*',
                    to: DIST_PATH,
                },
            ],
        }),
        new webpack.DefinePlugin({
            'process.env': {
                JEKYLL_ENV: JSON.stringify(commonEnv.JEKYLL_ENV),
                RELEASE_VERSION: JSON.stringify(commonEnv.RELEASE_VERSION),
                SENTRY_SDK_VERSION: JSON.stringify(
                    commonEnv.SENTRY_SDK_VERSION,
                ),
            },
        }),
        ...cssLoadPlugin,
    ],
}

function getCssLoadConfig() {
    if (!IS_PROD) {
        return { rule: [{ loader: 'style-loader' }], plugin: [] }
    }

    return {
        rule: [{ loader: CssExtractPlugin.loader }],
        plugin: [new CssExtractPlugin({ filename: '[name].min.css' })],
    }
}

function local(...components) {
    return path.resolve(__dirname, ...components)
}
