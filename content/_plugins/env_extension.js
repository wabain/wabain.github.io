/**
 * Invoked to expose JS build information to the Jekyll build
 */

const { RELEASE_VERSION, getSentryHash } = require('../../webpack/common-env')

main()

async function main() {
    let data
    try {
        const { url: sentry_dist_url, checksum: sentry_dist_hash } =
            getSentryHash()

        data = {
            sentry_dist_url,
            sentry_dist_hash,
            version: RELEASE_VERSION,
        }
    } catch (e) {
        console.error(e)
        process.exit(1)
    }

    console.log(JSON.stringify(data, undefined, 2))
}
