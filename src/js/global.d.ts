import { DynamicNavDispatcher } from './dynamic-navigation'

declare global {
    const process: {
        env: {
            JEKYLL_ENV: 'production' | 'development'
            RELEASE_VERSION?: string
            SENTRY_SDK_VERSION: string
        }
    }

    interface Window {
        __nav?: DynamicNavDispatcher | null
    }
}
