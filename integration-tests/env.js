const path = require('path')

const ORIGIN = process.env.TEST_ORIGIN || 'http://127.0.0.1:8080'
const BROWSER = process.env.TEST_BROWSER || 'firefox'
const SITE_META_PATH =
    process.env.TEST_SITE_META_PATH ||
    path.resolve(__dirname, '../_site/.test-meta.json')

module.exports = { ORIGIN, BROWSER, SITE_META_PATH }
