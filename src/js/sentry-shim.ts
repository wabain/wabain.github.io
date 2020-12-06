// We split sentry from the bundle, so theoretically it may not be available at
// runtime; this shim captures that by making the Sentry value possibly undefined

import * as Sentry from '@sentry/browser'
export type { Breadcrumb } from '@sentry/browser'

export type SentryClient = typeof Sentry
export default Sentry as SentryClient | undefined
