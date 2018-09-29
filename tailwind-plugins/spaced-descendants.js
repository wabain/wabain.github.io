'use strict'

/**
 * A plugin to apply a given margin size to descendants of the element. This
 * introduces cascading and specificity into the stylesheet, but is a near
 * necessity for working with extended textual content, unless preprocessing
 * is used on the content to attach appropriate classes to each `<p>` element,
 * etc.
 */
module.exports = ({
    selectors = ['p'],
    declarations = {
        mt: {
            prop: 'marginTop',
            config: 'margin',
        },
        mb: {
            prop: 'marginBottom',
            config: 'margin',
        },
    },
    variants = ['responsive'],
}) => (
    ({ e, config, addUtilities }) => {
        const utils = {}

        for (const selector of selectors) {
            for (const declName of Object.keys(declarations)) {
                const { prop, config: cfgKey } = declarations[declName]
                const cfgValues = config(cfgKey, {})

                for (const cfgName of Object.keys(cfgValues)) {
                    utils['.' + e(`spaced-${selector}-${declName}-${cfgName}`)] = {
                        [`${selector}:not(.spaced-escape)`]: {
                            [prop]: cfgValues[cfgName],
                        }
                    }
                }
            }
        }

        addUtilities(utils, variants)
    }
)