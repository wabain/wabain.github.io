import debugFactory from 'debug'

const TWITTER_WIDGET_URL = 'https://platform.twitter.com/widgets.js'

const debug = debugFactory('embeds:twitter')

let globalLoadPromise = null

/**
 * Handle initialization of Twitter embeds. If the content seems to contain
 * Tweets, we need to ensure the Twitter API is loaded and then have it
 * re-evaluate the page.
 */
export default function initializeTwitterEmbeds(content) {
    if (!content.querySelector('.twitter-tweet')) {
        return
    }

    const twttr = getTwitterApi()

    if (twttr) {
        twttr.widgets.load().catch((e) => {
            debug('failed to load twitter widgets: ' + e)
        })
        return
    }

    loadTwitterApi()
        .then((twttr) => twttr.widgets.load())
        .catch((e) => {
            debug('failed to load twitter api and widgets: ' + e)
        })
}

function getTwitterApi() {
    return window.twttr || null
}

function loadTwitterApi() {
    if (globalLoadPromise) {
        return globalLoadPromise
    }

    globalLoadPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script')

        script.src = TWITTER_WIDGET_URL
        script.async = true

        script.onload = () => {
            try {
                resolve(getTwitterApi())
            } catch (e) {
                reject(e)
            }
        }

        script.onerror = ({ message }) => {
            reject(new Error(message))
        }

        document.body.appendChild(script)
    })

    return globalLoadPromise
}
