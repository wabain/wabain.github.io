const process = require('process')
const request = require('request')
const NodeEnvironment = require('jest-environment-node');

class IntegrationEnvironment extends NodeEnvironment {
    constructor(config, context) {
        super(config, context)
    }

    async setup() {
        await super.setup();

        const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:8080'
        const browser = process.env.TEST_BROWSER || 'phantomjs'
        const siteMetaUrl = process.env.TEST_SITE_META_URL || origin + '/.site-meta.json'

        this.global.origin = origin
        this.global.browser = browser
        this.global.siteMeta = await loadSiteMeta(siteMetaUrl)
    }
}

async function loadSiteMeta(siteMetaUrl) {
    return await new Promise((res, rej) => {
        request(siteMetaUrl, (err, resp, body) => {
            if (err) {
                rej(err)
                return
            }

            if (resp.statusCode !== 200) {
                rej(new Error(`Unexpected status ${resp.statusCode} for ${siteMetaUrl}`))
                return
            }

            try {
                res(JSON.parse(body))
            } catch (e) {
                rej(e)
            }
        })
    })
}

module.exports = IntegrationEnvironment
