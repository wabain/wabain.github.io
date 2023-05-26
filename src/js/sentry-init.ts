import debugFactory from 'debug'
import Sentry from './sentry-shim'
import type { Breadcrumb, SeverityLevel, SentryClient } from './sentry-shim'

const dsn =
    'https://fff9e84f915d461d8d0347e42f2b07c1@o376549.ingest.sentry.io/5197459'

const onProdHost = location.hostname === 'wabain.github.io'

const debug = debugFactory('init:sentry')

const WARNING: SeverityLevel = 'warning'
const INFO: SeverityLevel = 'info'

export default function init(): SentryClient | null {
    if (!Sentry) {
        debug('instance not defined')
        return null
    }

    const enabled = onProdHost || localStorage.FORCE_SENTRY_ENABLE === 'true'

    try {
        Sentry.init({
            dsn,
            environment: process.env.JEKYLL_ENV,
            release: process.env.RELEASE_VERSION || undefined,
            enabled,
        })
    } catch (e) {
        debug('init failed: %o', e)
        return null
    }

    try {
        postInit(Sentry)
        debug('complete, enabled=%s', enabled)
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
        Sentry.captureMessage(msg, WARNING)
    }

    const RELEASE_VERSION = document
        .querySelector('meta[name="version"]')
        ?.getAttribute('content')

    if (process.env.RELEASE_VERSION !== RELEASE_VERSION) {
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        const msg = `Release version mismatch: want ${process.env.RELEASE_VERSION}, got ${RELEASE_VERSION}`
        debug(msg)
        Sentry.captureMessage(msg, WARNING)
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
                level: INFO,
                data,
            })
        }
    }
}
