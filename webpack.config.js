const path = require('path')

const { CleanWebpackPlugin } = require('clean-webpack-plugin')
const CopyWebpackPlugin = require('copy-webpack-plugin')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')

const IS_PROD = process.env.JEKYLL_ENV === 'production'
const DIST_PATH = local('content/home-assets')

const prodOutput = {
    path: DIST_PATH,
    filename: '[name].min.js',
    sourceMapFilename: '[file].map',
}

const devOutput = {
    path: DIST_PATH,
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
                test: /\.js$/,
                exclude: /node_modules/,
                use: ['eslint-loader'],
            },

            {
                test: /\.tsx?$/,
                exclude: /node_modules/,
                use: 'ts-loader',
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
                use: ['url-loader'],
            },
        ],
    },
    plugins: [
        new CleanWebpackPlugin(),
        new CopyWebpackPlugin([
            // Image assets, etc.
            // TODO: Might be good to run these through image-optimization passes
            {
                context: local('src/assets'),
                from: '**/*',
                to: DIST_PATH,
            },
        ]),
        ...extractCssPlugin,
    ],
}

function local(...components) {
    return path.resolve(__dirname, ...components)
}
