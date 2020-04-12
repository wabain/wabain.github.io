import '../scss/cs-homepage.scss'
import {
    initializeDynamicNavigation,
    DynamicNavDispatcher,
} from './dynamic-navigation'
import Analytics, { GtagBackend } from './analytics'
import twitterEmbed from './embeds/twitter'
import mediaEmbed from './embeds/media'

declare global {
    interface Window {
        __nav?: DynamicNavDispatcher | null
    }
}

window.__nav = initializeDynamicNavigation({
    analytics: new Analytics({
        backend: GtagBackend,
    }),
    contentTriggers: [twitterEmbed, mediaEmbed],
})
