import '../scss/cs-homepage.scss'
import { initializeDynamicNavigation } from './dynamic-navigation'
import Analytics, { SentryBackend, GtagBackend } from './analytics'
import twitterEmbed from './embeds/twitter'
import mediaEmbed from './embeds/media'
import initSentry from './sentry-init'

import debugFactory from 'debug'

const Sentry = initSentry()

const debug = debugFactory('index')
debug('%s, environment: %s', location.href, process.env.JEKYLL_ENV)

window.__nav = initializeDynamicNavigation({
    analytics: new Analytics({
        backends: [GtagBackend, ...(Sentry ? [new SentryBackend(Sentry)] : [])],
    }),
    contentTriggers: [twitterEmbed, mediaEmbed],
})
