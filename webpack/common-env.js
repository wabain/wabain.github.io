const JEKYLL_ENV = process.env.JEKYLL_ENV ?? 'development'
const RELEASE_VERSION = process.env.WB_RELEASE_VERSION ?? undefined

const SENTRY_BROWSER_ROOT = 'https://browser.sentry-cdn.com'
const SENTRY_SDK_VERSION = require('@sentry/browser/package.json').version
const RUNTIME_DEPS = require('../runtime-deps.json')

module.exports = {
    JEKYLL_ENV,
    RELEASE_VERSION,
    SENTRY_BROWSER_ROOT,
    SENTRY_SDK_VERSION,
    getSentryHash,
}

function getSentryHash() {
    const expectedUrlPrefix = `${SENTRY_BROWSER_ROOT}/${SENTRY_SDK_VERSION}/`
    const params = RUNTIME_DEPS.integrity['@sentry/browser']

    if (!params.url.startsWith(expectedUrlPrefix)) {
        throw new Error(
            `expected Sentry SDK URL to start with ${expectedUrlPrefix}; got: ${JSON.stringify(
                params,
                undefined,
                2,
            )}`,
        )
    }

    return { url: params.url, checksum: params.checksum }
}
