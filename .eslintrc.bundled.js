/*
 * A simple config to verify the quality of processed, bundled code.
 * The primary motivation for having this is to ensure no ES6-isms
 * got through. I want to be able to use module syntax without installing
 * a whole Babel pipeline to support the other ES6 stuff.
 */

module.exports = {
    "root": true,
    "parserOptions": {
        "ecmaVersion": 5
    },
    "env": {
        "browser": true
    }
};
