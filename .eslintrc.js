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
                "jQuery": false
            },
            // FIXME: Legacy rules, with varying degrees of weirdness
            "rules": {
                "linebreak-style": [
                    "error",
                    "windows"
                ],
                "indent": [
                    "error",
                    2,
                    { "VariableDeclarator": 2 }
                ],
                "semi": [
                    "error",
                    "always"
                ],
            }
        },
    ]
};
