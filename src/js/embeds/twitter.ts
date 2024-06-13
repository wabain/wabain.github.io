import debugFactory from 'debug'

import type Analytics from '../analytics'
import initTwitter from './twitter-init'

const debug = debugFactory('embeds:twitter')

let globalLoadPromise: Promise<Twitter> | null = null

/**
 * Handle initialization of Twitter embeds. If the content seems to contain
 * tweets, we need to ensure the Twitter API is loaded and then have it
 * re-evaluate the page.
 */
export default function initializeTwitterEmbeds(
    content: HTMLElement,
    analytics: Analytics,
): void {
    if (!content.querySelector('.twitter-tweet')) {
        return
    }

    loadTwitterApi(analytics)
        .then((twttr) => {
            debug('requesting load of twitter widgets')

            return Promise.resolve(twttr.widgets.load(content))
                .then(() => {
                    debug('twitter widgets load complete')
                })
                .catch((e) => {
                    debug('failed to load twitter widgets: %s', e)

                    analytics.onError({
                        exception: e,
                        context: {
                            when: 'transition.embeds',
                            contentTrigger: 'twitter',
                        },
                        category: 'dynamic nav',
                    })
                })
        })
        .catch((e) => {
            debug('failed to load twitter API and widgets: %s', e)
        })
}

function loadTwitterApi(analytics: Analytics): Promise<Twitter> {
    if (globalLoadPromise) {
        return globalLoadPromise
    }

    globalLoadPromise = new Promise((resolve, reject) => {
        const twttr = initTwitter()

        twttr.ready((api) => {
            resolve(api)
        })

        const script = document.getElementById('twitter-wjs')

        if (!script) {
            reject(new Error('failed to locate #twitter-wjs element'))
            return
        }

        script.addEventListener(
            'error',
            (e) => {
                const message = (e.error ?? e.message) || 'unspecified error'

                reject(new Error(`failed to load script: ${message}`))
            },
            { once: true },
        )
    })

    globalLoadPromise.catch((err) => {
        debug('twitter load failed: %s', err)

        analytics.onError({
            exception: err,
            context: {
                when: 'transition.embeds.init',
                contentTrigger: 'twitter',
            },
            category: 'dynamic nav',
        })

        globalLoadPromise = null
    })

    return globalLoadPromise
}
