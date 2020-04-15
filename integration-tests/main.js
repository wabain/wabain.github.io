'use strict'

/* eslint "no-console": off */

const path = require('path')
const glob = require('glob')
const request = require('request')

glob('**/*.test.js', { cwd: __dirname }, (err, files) => {
    if (err) {
        console.error(`Test module lookup failed: ${err}`)
    }

    const testModules = files.map((f) => require(path.resolve(__dirname, f)))
    const env = getTestEnvironment()

    loadSiteMeta(env.siteMetaUrl)
        .then(async (siteMeta) => {
            for (const main of testModules) {
                if (main) {
                    const args = Object.assign({}, env, { siteMeta })
                    await main(args)
                }
            }

            run()
        })
        .catch((err) => {
            console.error(`Test launch failed: ${err}`)
        })
})

function getTestEnvironment() {
    const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:8080'
    const browser = process.env.TEST_BROWSER || 'firefox'
    const siteMetaUrl =
        process.env.TEST_SITE_META_URL || origin + '/.test-meta.json'
    return { origin, browser, siteMetaUrl }
}

function loadSiteMeta(siteMetaUrl) {
    return new Promise((res, rej) => {
        request(siteMetaUrl, (err, resp, body) => {
            if (err) {
                rej(err)
                return
            }

            if (resp.statusCode !== 200) {
                rej(
                    new Error(
                        `Unexpected status ${resp.statusCode} for ${siteMetaUrl}`,
                    ),
                )
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
