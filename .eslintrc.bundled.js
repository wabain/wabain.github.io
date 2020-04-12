/*
 * A simple config to verify processed, bundled code.
 *
 * The primary motivation for having this is to ensure no ES.Next-isms get
 * through untranspiled.
 */
module.exports = {
    root: true,
    parserOptions: {
        ecmaVersion: 6,
    },
    env: {
        browser: true,
    },
}
