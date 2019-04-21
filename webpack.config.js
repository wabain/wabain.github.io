const path = require('path')
const fs = require('fs')

const StyleLintPlugin = require('stylelint-webpack-plugin')
const CopyWebpackPlugin = require('copy-webpack-plugin')
const ExtractTextPlugin = require('extract-text-webpack-plugin')
const UglifyJSPlugin = require('uglifyjs-webpack-plugin')

const IS_PROD = process.env.JEKYLL_ENV === 'production'
const DIST_PATH = local('content/home-assets')

const commonEntryPoints = {
    'cs-homepage': local('src/js/index.js')
}

const extractSass = new ExtractTextPlugin({
    filename: '[name].min.css',
    disable: !IS_PROD,
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
                {
                    loader: 'css-loader',
                    options: {
                        minimize: IS_PROD,
                    }
                },
                'postcss-loader',
                {
                    loader: 'sass-loader',
                    options: {
                        outputStyle: IS_PROD ? 'compressed' : 'expanded'
                    }
                }
            ],
            // use style-loader in development
            fallback: 'style-loader'
        })
    },

    {
        test: /\.svg$/,
        include: [local('src/buildtime-assets')],
        use: ['url-loader'],
    },
]

const commonPlugins = [
    // Webpack can't see through SCSS dependencies, so lint all SCSS files via
    // glob
    new StyleLintPlugin({
        context: local('src')
    }),
    new CopyWebpackPlugin([
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
            from: '**/*.{html,md}',
            ignore: [
                'section-partial/**/*',
                '_*/**/*',
            ],
            to: local('content/section-partial/')
        },
        {
            context: local('content/_posts'),
            from: '**/*.{html,md}',
            to: local('content/section-partial'),

            // Translate a post with basename YYYY-MM-DD-xyz to YYYY/MM/DD/xyz
            // to emulate Jekyll. This is probably not exactly right but it's
            // close enough.
            transformPath(targetPath) {
                const basename = path.basename(targetPath)
                const m = (/([0-9]+)-([0-9]+)-([0-9]+)-(.*)/).exec(basename)
                if (!m) {
                    throw new Error('unexpected pattern for path ' + targetPath)
                }
                return `${path.dirname(targetPath)}/${m[1]}/${m[2]}/${m[3]}/${m[4]}`
            },
        },
        {
            context: local('content/_drafts'),
            from: '**/*.{html,md}',
            to: local('content/section-partial'),

            // Translate a draft with basename xyz to YYYY/MM/DD/xyz using its
            // atime to emulate Jekyll. This is probably not exactly right but
            // hopefully it's close enough.
            transformPath(targetPath, absolutePath) {
                return new Promise((resolve, reject) => {
                    fs.stat(absolutePath, (err, stats) => {
                        if (err) {
                            reject(err)
                            return
                        }

                        // This seems to work, but there must be much
                        // cleaner ways to get YYYY/MM/DD format in JS
                        const date = stats.ctime.toLocaleDateString('en-CA').replace(/-/g, '/')

                        resolve(`${path.dirname(targetPath)}/${date}/${path.basename(targetPath)}`)
                    })
                })
            },
        },

        // Vendored assets
        // TODO: Should be able to import these directly from source files?
        {
            context: local('node_modules/jquery/dist'),
            from: '**/*',
            to: local(DIST_PATH, 'vendor/jquery'),
        },
    ]),
    extractSass
]

const devConfig = {
    output: {
        path: DIST_PATH,
        filename: '[name].js',
    },
    entry: commonEntryPoints,
    devtool: 'inline-source-map',
    module: {
        rules: [
            ...commonRules,
        ]
    },
    plugins: [
        ...commonPlugins,
    ]
}

const prodConfig = {
    output: {
        path: DIST_PATH,
        filename: '[name].min.js',
        sourceMapFilename: '[file].map',
    },
    entry: commonEntryPoints,
    devtool: 'source-map',
    module: {
        rules: [
            ...commonRules,
        ]
    },
    plugins: [
        ...commonPlugins,
        new UglifyJSPlugin({ sourceMap: true })
    ]
}

module.exports = IS_PROD ? prodConfig : devConfig

function local(...components) {
    return path.resolve(__dirname, ...components)
}
