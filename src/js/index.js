import '../scss/cs-homepage.scss'
import { DynamicNavDispatcher } from './dynamic-navigation'
import Analytics, { GtagBackend } from './analytics-shim'
import twitterEmbed from './embeds/twitter'
import mediaEmbed from './embeds/media'

window.__nav = new DynamicNavDispatcher({
    analytics: new Analytics({
        backend: GtagBackend,
    }),
    contentTriggers: [
        twitterEmbed,
        mediaEmbed,
    ],
})
