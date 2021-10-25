/**
 * Invoked to expose JS build information to the Jekyll build
 */

const {
    RELEASE_VERSION,
    SENTRY_BROWSER_ROOT,
    SENTRY_SDK_VERSION,
    computeSentryHash,
} = require('../../webpack/common-env')

main()

async function main() {
    let data
    try {
        data = {
            sentry_dist_url: `${SENTRY_BROWSER_ROOT}/${SENTRY_SDK_VERSION}/bundle.min.js`,
            sentry_dist_hash: await computeSentryHash(),
            version: RELEASE_VERSION,
        }
    } catch (e) {
        console.error(e)
        process.exit(1)
    }

    console.log(JSON.stringify(data, undefined, 2))
}
