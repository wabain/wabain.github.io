import '../scss/cs-homepage.scss'
import { DynamicNavDispatcher } from './dynamic-navigation'
import Analytics, { GtagBackend } from './analytics-shim'

window.__nav = new DynamicNavDispatcher({
    analytics: new Analytics({
        backend: GtagBackend,
    }),
})
