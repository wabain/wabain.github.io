import '../scss/cs-homepage.scss'
import { initializeDynamicNavigation } from './dynamic-navigation'
import Analytics, { SentryBackend, GtagBackend } from './analytics'
import twitterEmbed from './embeds/twitter'
import mediaEmbed from './embeds/media'
import initSentry from './sentry-init'

import debugFactory from 'debug'

const Sentry = initSentry()

const debug = debugFactory('index')

{
    const {
        JEKYLL_ENV: env,
        RELEASE_VERSION: releaseVersion,
        ...envKeys
    } = process.env

    debug(
        '%s, environment: %s, version: %s, etc: %o',
        location.href,
        env,
        releaseVersion,
        envKeys,
    )
}

window.__nav = initializeDynamicNavigation({
    analytics: new Analytics({
        backends: [GtagBackend, ...(Sentry ? [new SentryBackend(Sentry)] : [])],
    }),
    contentTriggers: [twitterEmbed, mediaEmbed],
})
