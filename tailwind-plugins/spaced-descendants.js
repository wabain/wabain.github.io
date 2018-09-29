'use strict'

/**
 * A plugin to apply a given margin size to descendants of the element. This
 * introduces cascading and specificity into the stylesheet, but is a near
 * necessity for working with extended textual content, unless preprocessing
 * is used on the content to attach appropriate classes to each `<p>` element,
 * etc.
 */
module.exports = ({ selectors = ['p'], variants = ['responsive'] }) => (
    ({ e, config, addUtilities }) => {
        const utils = {}
        const margins = config('margin', {})
        const marginNames = Object.keys(margins)

        for (const selector of selectors) {
            for (const name of marginNames) {
                utils['.' + e(`spaced-${selector}-${name}`)] = {
                    [selector]: {
                        marginBottom: margins[name],
                    }
                }
            }
        }

        addUtilities(utils, variants)
    }
)