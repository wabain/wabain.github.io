module.exports = {
    "extends": "eslint:recommended",
    "root": true,
    "env": {
        "node": true,
        "es6": true
    },
    "rules": {
        "indent": [
            "error",
            4
        ],
        "linebreak-style": [
            "error",
            "unix"
        ],
        "quotes": [
            "error",
            "single"
        ],
        "semi": [
            "error",
            "never"
        ]
    },
    "overrides": [
        // Source files
        {
            "files": ["src/**/*.js"],
            "parserOptions": {
                "ecmaVersion": 6,
                "sourceType": "module"
            },
            "env": {
                "browser": true,
                "node": false,
                "es6": false
            },
            "globals": {
                "Promise": false,
                "jQuery": false
            },
        },
        // Test files
        {
            "files": ["integration-tests/**/*.js"],
            "parserOptions": {
                "ecmaVersion": 2017
            },
            "env": {
                "es6": true,
                "mocha": true
            },
        }
    ]
};
