var normalizeElem = document.createElement('a');

/**
 * Get a URL relative to the root of this domain for the URL referred to by
 * href. If href is from a a different origin, return null.
 */
export function getDomainRelativeUrl(href) {
  if (!setAndValidateHref(href)) {
    return null;
  }

  return normalizeElem.pathname + normalizeElem.search + normalizeElem.hash;
}

/**
 * Return true if the argument is a string which can be parsed as a URL in
 * the same origin as this document.
 */
export function isRelativeHref(href) {
  return setAndValidateHref(href);
}

function setAndValidateHref(href) {
  if (typeof href !== 'string') {
    return false;
  }
  normalizeElem.href = href;
  return normalizeElem.origin === location.origin;
}
