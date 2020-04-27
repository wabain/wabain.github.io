'use strict'

/* eslint "no-console": off */

const path = require('path')
const glob = require('glob')

const env = getTestEnvironment()
const siteMeta = require(env.siteMetaPath)

glob('**/*.test.js', { cwd: __dirname }, (err, files) => {
    if (err) {
        console.error(`Test module lookup failed: ${err}`)
    }

    const testModules = files.map((f) => require(path.resolve(__dirname, f)))

    runMainTests(testModules).catch((err) => {
        console.error(`Test launch failed: ${err}`)
        process.exit(1)
    })
})

async function runMainTests(testModules) {
    for (const main of testModules) {
        if (main) {
            const args = Object.assign({}, env, { siteMeta })
            await main(args)
        }
    }

    run()
}

function getTestEnvironment() {
    const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:8080'
    const browser = process.env.TEST_BROWSER || 'firefox'

    const siteMetaPath =
        process.env.TEST_SITE_META_PATH ||
        path.resolve(__dirname, '../_site/.test-meta.json')

    return { origin, browser, siteMetaPath }
}
