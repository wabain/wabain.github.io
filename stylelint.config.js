module.exports = {
    extends: ['stylelint-config-standard', 'stylelint-config-prettier'],
    plugins: ['stylelint-order', 'stylelint-scss'],
    rules: {
        'at-rule-no-unknown': [
            true,
            { ignoreAtRules: ['extend', 'use', 'mixin', 'include'] },
        ],
        'declaration-empty-line-before': [
            'always',
            {
                except: ['first-nested'],
                ignore: [
                    'after-comment',
                    'after-declaration',
                    'inside-single-line-block',
                ],
            },
        ],
        'order/properties-order': [
            concentricPropertyOrder({ emptyLineBefore: 'threshold' }),
            {
                unspecified: 'bottom',
                emptyLineBeforeUnspecified: 'threshold',
                emptyLineMinimumPropertyThreshold: 5,
            },
        ],
        'string-quotes': 'double',
        ...stylelintConfigSassRules(),
    },
    ignoreFiles: ['src/scss/vendor/**/*'],
}

// A subset of rules from:
// https://github.com/bjankord/stylelint-config-sass-guidelines/blob/a710e5b80586a86284bb417b469d7a9dd098e86d/src/.stylelintrc.json
function stylelintConfigSassRules() {
    return {
        'order/order': [
            [
                'custom-properties',
                'dollar-variables',
                {
                    type: 'at-rule',
                    name: 'extend',
                },
                {
                    type: 'at-rule',
                    name: 'include',
                    hasBlock: false,
                },
                'declarations',
                {
                    type: 'at-rule',
                    name: 'include',
                    hasBlock: true,
                },
                'rules',
            ],
        ],
        'scss/at-extend-no-missing-placeholder': true,
        'scss/at-function-pattern': '^[a-z]+([a-z0-9-]+[a-z0-9]+)?$',
        'scss/at-import-no-partial-leading-underscore': true,
        'scss/at-import-partial-extension-blacklist': ['scss'],
        'scss/at-mixin-pattern': '^[a-z]+([a-z0-9-]+[a-z0-9]+)?$',
        'scss/at-rule-no-unknown': true,
        'scss/dollar-variable-colon-space-after': 'always',
        'scss/dollar-variable-colon-space-before': 'never',
        'scss/dollar-variable-pattern': '^[_]?[a-z]+([a-z0-9-]+[a-z0-9]+)?$',
        'scss/percent-placeholder-pattern': '^[a-z]+([a-z0-9-]+[a-z0-9]+)?$',
        'scss/selector-no-redundant-nesting-selector': true,
    }
}

function concentricPropertyOrder(extra) {
    return [
        ['display', 'position', 'top', 'right', 'bottom', 'left'],
        [
            'grid',
            'grid-area',
            'grid-template',
            'grid-template-areas',
            'grid-template-rows',
            'grid-template-columns',
            'grid-row',
            'grid-row-start',
            'grid-row-end',
            'grid-column',
            'grid-column-start',
            'grid-column-end',
            'grid-auto-rows',
            'grid-auto-columns',
            'grid-auto-flow',
            'grid-gap',
            'grid-row-gap',
            'grid-column-gap',
        ],
        [
            'columns',
            'column-gap',
            'column-fill',
            'column-rule',
            'column-span',
            'column-count',
            'column-width',
        ],
        ['float', 'clear'],
        ['transform', 'transition', 'visibility', 'opacity'],
        'z-index',
        'box-sizing',
        [
            'margin',
            'margin-top',
            'margin-right',
            'margin-bottom',
            'margin-left',
        ],
        [
            'outline',
            'outline-width',
            'outline-offset',
            'outline-style',
            'outline-color',
        ],
        [
            'border',
            'border-top',
            'border-right',
            'border-bottom',
            'border-left',
            'border-width',
            'border-top-width',
            'border-right-width',
            'border-bottom-width',
            'border-left-width',
            'border-style',
            'border-top-style',
            'border-right-style',
            'border-bottom-style',
            'border-left-style',
            'border-radius',
            'border-top-left-radius',
            'border-top-right-radius',
            'border-bottom-left-radius',
            'border-bottom-right-radius',
            'border-color',
            'border-top-color',
            'border-right-color',
            'border-bottom-color',
            'border-left-color',
        ],
        'box-shadow',
        [
            'background',
            'background-color',
            'background-image',
            'background-repeat',
            'background-position',
            'background-size',
        ],
        'cursor',
        [
            'padding',
            'padding-top',
            'padding-right',
            'padding-bottom',
            'padding-left',
        ],
        [
            'width',
            'min-width',
            'max-width',
            'height',
            'min-height',
            'max-height',
        ],
        'overflow',
        'resize',
        'list-style',
        'caption-side',
        'table-layout',
        'border-collapse',
        'border-spacing',
        'empty-cells',
        'vertical-align',
        [
            'text-align',
            'text-indent',
            'text-transform',
            'text-decoration',
            'text-rendering',
            'text-shadow',
            'text-overflow',
        ],
        'line-height',
        'word-spacing',
        'letter-spacing',
        'white-space',
        'color',
        [
            'font',
            'font-family',
            'font-size',
            'font-weight',
            'font-smoothing',
            'font-style',
        ],
        'content',
        'quotes',
    ].map((properties) => {
        // Don't think this grouping does anything at the moment, but it might
        // come in handy some day
        if (Array.isArray(properties)) {
            return { properties, ...extra }
        }
        return { properties: [properties], ...extra }
    })
}
