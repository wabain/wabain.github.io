/*
 * A simple config to verify processed, bundled code.
 *
 * The primary motivation for having this is to ensure no ES.Next-isms get
 * through untranspiled.
 */
const { defineConfig } = require('eslint/config')
const globals = require('globals')

module.exports = defineConfig([
    {
        languageOptions: {
            ecmaVersion: 2015,
            sourceType: 'script',
            globals: globals.browser,
        },
    },
])
