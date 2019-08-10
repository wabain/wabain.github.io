var normalizeElem = document.createElement('a')

/**
 * Get a URL relative to the root of this domain for the URL referred to by
 * href. If href is from a a different origin, return null.
 */
export function getDomainRelativeUrl(href, { hash = false } = {}) {
    if (!setAndValidateHref(href)) {
        return null
    }

    let url = normalizeElem.pathname + normalizeElem.search

    if (hash)
        url += normalizeElem.hash

    return url
}

/**
 * Return true if the URL represents a hash change from the current
 * location.
 */
export function isHashChange(href) {
    if (!setAndValidateHref(href)) {
        return false
    }

    const loc = location

    // origin must already match for setAndValidateHref to succeed
    return (
        normalizeElem.pathname === loc.pathname &&
        normalizeElem.search == loc.search &&
        normalizeElem.hash !== loc.hash
    )
}

/**
 * Return true if the argument is a string which can be parsed as a URL in
 * the same origin as this document.
 */
export function isRelativeHref(href) {
    return setAndValidateHref(href)
}

/**
 * Returns true if the href is the same as the current page
 */
export function isCurrentLocation(href) {
    if (!setAndValidateHref(href)) {
        return false
    }

    return normalizeElem.href === location.href
}

function setAndValidateHref(href) {
    if (typeof href !== 'string') {
        return false
    }
    normalizeElem.href = href
    return normalizeElem.origin === location.origin
}
