const path = require('path')

const { DefinePlugin } = require('webpack')
const { CleanWebpackPlugin } = require('clean-webpack-plugin')
const CopyWebpackPlugin = require('copy-webpack-plugin')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const svgToDataURI = require('mini-svg-data-uri')

const IS_PROD = process.env.JEKYLL_ENV === 'production'
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

let extractCssRule, extractCssPlugin
if (IS_PROD) {
    extractCssRule = [{ loader: MiniCssExtractPlugin.loader }]
    extractCssPlugin = [
        new MiniCssExtractPlugin({
            filename: '[name].min.css',
        }),
    ]
} else {
    extractCssRule = [{ loader: 'style-loader' }]
    extractCssPlugin = []
}

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
                enforce: 'pre',
                test: /\.[jt]s$/,
                exclude: /node_modules/,
                use: 'eslint-loader',
            },

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
                    ...extractCssRule,
                    { loader: 'css-loader', options: { importLoaders: 1 } },
                    { loader: 'postcss-loader', options: { sourceMap: true } },
                    {
                        loader: 'sass-loader',
                        options: {
                            sassOptions: {
                                outputStyle: IS_PROD
                                    ? 'compressed'
                                    : 'expanded',
                            },
                        },
                    },
                ],
            },

            {
                test: /\.svg$/,
                include: [local('src/buildtime-assets')],
                use: [
                    {
                        loader: 'url-loader',
                        options: {
                            encoding: false,
                            generator: (content, _mimetype, encoding) =>
                                svgToDataURI(
                                    content.toString(encoding || undefined),
                                ),
                        },
                    },
                ],
            },
        ],
    },
    externals: {
        '@sentry/browser': 'Sentry',
    },
    plugins: [
        new CleanWebpackPlugin(),
        new CopyWebpackPlugin(
            [
                // Image assets, etc.
                // TODO: Might be good to run these through image-optimization passes
                {
                    context: local('src/assets'),
                    from: '**/*',
                    to: DIST_PATH,
                },
            ],
            // https: //github.com/webpack-contrib/copy-webpack-plugin/issues/261#issuecomment-552550859
            { copyUnmodified: true },
        ),
        new DefinePlugin({
            'process.env': {
                JEKYLL_ENV: JSON.stringify(
                    IS_PROD ? 'production' : 'development',
                ),
                // TODO(wabain): Generate version in CI
                RELEASE_VERSION: JSON.stringify(
                    process.env.RELEASE_VERSION || '',
                ),
                SENTRY_SDK_VERSION: JSON.stringify(
                    require('@sentry/browser/package.json').version,
                ),
            },
        }),
        ...extractCssPlugin,
    ],
}

function local(...components) {
    return path.resolve(__dirname, ...components)
}
