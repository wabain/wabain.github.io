const crypto = require('crypto')
const fs = require('fs')

const SENTRY_BROWSER_ROOT = 'https://browser.sentry-cdn.com'
const SENTRY_SDK_VERSION = require('@sentry/browser/package.json').version

module.exports = { SENTRY_BROWSER_ROOT, SENTRY_SDK_VERSION, computeSentryHash }

async function computeSentryHash() {
    const sentryHash = await computeHash(
        require.resolve('@sentry/browser/build/bundle.min.js'),
        'sha384',
    )

    return `sha384-${sentryHash}`
}

function computeHash(filename, algorithm) {
    return new Promise((res, rej) => {
        const hasher = crypto.createHash(algorithm)

        const s = fs.ReadStream(filename)

        s.on('data', (d) => {
            hasher.update(d)
        })

        s.on('error', (err) => rej(err))

        s.on('end', () => {
            res(hasher.digest('base64'))
        })
    })
}
