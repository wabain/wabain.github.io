const path = require('path')

const CopyWebpackPlugin = require('copy-webpack-plugin')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')

const IS_PROD = process.env.JEKYLL_ENV === 'production'
const DIST_PATH = local('content/home-assets')

const commonEntryPoints = {
    'cs-homepage': local('src/js/index.js')
}

let extractCssRule, extractCssPlugin
if (IS_PROD) {
    extractCssRule = [
        { loader: MiniCssExtractPlugin.loader },
    ]
    extractCssPlugin = [
        new MiniCssExtractPlugin({
            filename: '[name].min.css',
        }),
    ]
} else {
    extractCssRule = [
        { loader: 'style-loader' },
    ]
    extractCssPlugin = []
}

const rules = [
    {
        enforce: 'pre',
        test: /\.js$/,
        exclude: /node_modules/,
        use: ['eslint-loader'],
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
                    outputStyle: IS_PROD ? 'compressed' : 'expanded'
                }
            }
        ]
    },

    {
        test: /\.svg$/,
        include: [local('src/buildtime-assets')],
        use: ['url-loader'],
    },
]

const plugins = [
    new CopyWebpackPlugin([
        // Image assets, etc.
        // TODO: Might be good to run these through image-optimization passes
        {
            context: local('src/assets'),
            from: '**/*',
            to: DIST_PATH
        },
    ]),
    ...extractCssPlugin,
]

const devConfig = {
    mode: 'development',
    output: {
        path: DIST_PATH,
        filename: '[name].js',
    },
    entry: commonEntryPoints,
    devtool: 'inline-source-map',
    module: {
        rules,
    },
    plugins,
}

const prodConfig = {
    mode: 'production',
    output: {
        path: DIST_PATH,
        filename: '[name].min.js',
        sourceMapFilename: '[file].map',
    },
    entry: commonEntryPoints,
    devtool: 'source-map',
    module: {
        rules,
    },
    plugins,
}

module.exports = IS_PROD ? prodConfig : devConfig

function local(...components) {
    return path.resolve(__dirname, ...components)
}
