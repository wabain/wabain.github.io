import debugFactory from 'debug'

import initTwitter from './twitter-init'

const debug = debugFactory('embeds:twitter')

let globalLoadPromise = null

/**
 * Handle initialization of Twitter embeds. If the content seems to contain
 * tweets, we need to ensure the Twitter API is loaded and then have it
 * re-evaluate the page.
 */
export default function initializeTwitterEmbeds(content) {
    if (!content.querySelector('.twitter-tweet')) {
        return
    }

    loadTwitterApi()
        .then((twttr) => {
            debug('requesting load of twitter widgets')
            return twttr.widgets.load()
        })
        .then(() => {
            debug('twitter widgets load complete')
        })
        .catch((e) => {
            debug('failed to load twitter API and widgets: ' + e)
        })
}

function loadTwitterApi() {
    if (globalLoadPromise) {
        return globalLoadPromise
    }

    globalLoadPromise = new Promise((resolve, reject) => {
        const twttr = initTwitter()

        twttr.ready((api) => {
            resolve(api)
        })

        const script = document.getElementById('twitter-wjs')

        if (script) {
            script.addEventListener('error', (err) => {
                const message = typeof err === 'string' ? err : String(err)

                reject(new Error(message))
            })
        }
    })

    // TODO: Expose error to analytics
    globalLoadPromise.catch((err) => {
        debug('twitter load failed: %s', err)
        globalLoadPromise = null
    })

    return globalLoadPromise
}
