const Svgo = require('svgo')

/**
 * A simple SVGO loader. Currently it only accepts the SVGO defaults and uses
 * them to minify the SVG when `mode` is production.
 *
 * @type import('webpack').Loader
 */
module.exports = function svgoLoader(source) {
    this.cacheable(true)

    if (this.mode !== 'production') {
        return source
    }

    const callback = this.async()

    new Svgo().optimize(source).then(
        ({ data }) => {
            callback(null, data)
        },
        (err) => {
            callback(err)
        },
    )
}
