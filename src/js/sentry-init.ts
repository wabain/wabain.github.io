import debugFactory from 'debug'
import Sentry from './sentry-shim'
import type { Breadcrumb, SentryClient } from './sentry-shim'

const dsn =
    'https://fff9e84f915d461d8d0347e42f2b07c1@o376549.ingest.sentry.io/5197459'

const debug = debugFactory('init:sentry')

export default function init(): SentryClient | null {
    if (!Sentry) {
        debug('instance not defined')
        return null
    }

    try {
        Sentry.init({
            dsn,
            environment: process.env.JEKYLL_ENV,
            release: process.env.RELEASE_VERSION || undefined,
        })
    } catch (e) {
        debug('init failed: %o', e)
        return null
    }

    try {
        postInit(Sentry)
        debug('complete')
    } catch (e) {
        debug('post-init failed: %o', e)

        try {
            Sentry.captureException(e)
        } catch (e) {
            debug('post-init report failed: %o', e)
        }
    }

    return Sentry
}

function postInit(Sentry: SentryClient): void {
    if (process.env.SENTRY_SDK_VERSION !== Sentry.SDK_VERSION) {
        const msg = `Sentry version mismatch: want ${process.env.SENTRY_SDK_VERSION}, got ${Sentry.SDK_VERSION}`
        debug(msg)
        Sentry.captureMessage(msg, Sentry.Severity.Warning)
    }

    const { dataLayer } = window as {
        dataLayer?: { length: number; [key: number]: unknown }[]
    }

    if (dataLayer?.length) {
        for (const args of dataLayer) {
            const data: Breadcrumb['data'] = {}

            for (const [i, arg] of Array.from(args).entries()) {
                data[i] = arg
            }

            Sentry.addBreadcrumb({
                category: 'initial-gtag',
                level: Sentry.Severity.Info,
                data,
            })
        }
    }
}
