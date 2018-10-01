import debugFactory from 'debug';
import { getDomainRelativeUrl, isRelativeHref, isCurrentLocation } from './normalize-href';

var debug = debugFactory('dynamic-navigation');

/**
 * Parse the document's title. The base title is all text up to the final "-",
 * excluding trailing whitespace. Subsequent text is the page title.
 */
function parseTitle(title) {
  var parsed = (/(.*?)(?:\s*-\s*([^-]*))?$/).exec(title);
  return {
    base: parsed[1],
    page: parsed[2] || null,
  };
}

(function ($) {
  'use strict';
  var baseTitle, $contentElem, cache, loadingIndicator, initialPageData;

  // Only initialize dynamic navigation if HTML5 history APIs are available
  if (!window.history || !window.history.pushState) {
    debug('bailing on initialization, no support for history api');
    return;
  }

  $contentElem = getContentElem();

  if (!$contentElem) {
    debug('bailing, failed to find content element (url %s)', location.href);
    return;
  }

  cache = {};
  initializeNavigation();

  function initializeNavigation() {
    var currentHref = getDomainRelativeUrl(location.href);
    var parsedTitle = parseTitle(document.title);

    baseTitle = parsedTitle.base;
    initialPageData = {
      href: currentHref,
      state: {
        title: parsedTitle.page,
      },
    };

    cache[currentHref] = $contentElem.html();
    history.replaceState(
      initialPageData.state,
      initialPageData.state.title,
      currentHref);

    debug('initialize at %s, state %o', currentHref, initialPageData.state);

    // Bind local links in the header
    $('[data-region-id="page-header"] a[href]').filter(function () {
      return isRelativeHref($(this).attr('href'));
    }).on('click', doDynamicNavigation);

    window.addEventListener('popstate', handlePopState, false);
  }

  function doDynamicNavigation(e) {
    var $elem = $(e.currentTarget),
        href = getDomainRelativeUrl($elem.attr('href')),
        navLink,
        state,
        specificTitle;

    debug('dynamic navigation triggered (href normalized %s, raw %s)',
      href,
      $elem.attr('href'));

    // If the current href is the same as the one which was clicked, return
    // and let the page reload. The rationale is that if the user is continuing
    // to click, then the page probably hasn't been responding as desired.
    if (isCurrentLocation(href)) {
      debug('dynamic navigation for current location, allowing default');
      return;
    }

    // If the href is null (perhaps because it was absolute) then return
    // and let the default occur.
    if (!href)
      return;

    // Stop the page from reloading
    e.preventDefault();

    navLink = getNavLink(href);
    if (navLink.length === 0)
      navLink = $elem;

    specificTitle = navLink.attr('data-pagetitle') || navLink.text();

    state = { title: specificTitle };
    window.history.pushState(state, specificTitle, href);

    loadPageContent(href, state, navLink);
  }

  /**
   * Look up the section partial in the cache, making a request for it
   * if it is not already there.
   *
   * @param {String} href The href to load, which should be a normalized
   * domain-relative URL
   */
  function loadSectionPartial(href) {
    if (cache.hasOwnProperty(href)) {
      return $.when(cache[href]);
    }

    var cacheUrl = '/section-partial' + (href === '/' ? '/index.html' : href);

    debug('load %s: requesting partial %s', href, cacheUrl);
    return $.get(cacheUrl).then(function (newContent) {
      debug('load %s: writing entry to cache', href);
      cache[href] = newContent;
      return newContent;
    });
  }

  function noop(){}

  /**
   * Load the content of the href, setting the page state to state and the
   * current link to navLink.
   */
  function loadPageContent(href, state, navLink) {
    var debugLoad = !debug.enabled ? noop : function (format) {
      var args = ['load %s: ' + format, href];
      var passedArgCount = arguments.length;
      for (var i=1; i < passedArgCount; i++) {
        args.push(arguments[i]);
      }
      debug.apply(null, args);
    };

    debugLoad('set up navigation, state %o', state);
    setGlobalPageState(state);

    // Fade out the content
    $contentElem.addClass('fading faded-out');

    // Update the links in the navbar
    $('[data-region-id="primary-content"]').not(navLink).removeClass('active-link');
    navLink.addClass('active-link');

    var loadNewContent = loadSectionPartial(href).fail(function () {
      debugLoad('failed to resolve partial, doing hard load', href);
      window.location = href;
    });

    // Wait for at least 500ms and for the new content to load
    var displayedNewContent = $.when(loadNewContent, waitFor(500));

    // If loading takes at least 750ms then show a loading indicator
    waitFor(750).then(function () {
      if (loadingIndicator || displayedNewContent.state() !== 'pending')
        return;

      debugLoad('load timeout exceeded, show loading indicator');
      $contentElem.addClass('hidden');

      loadingIndicator = $('<img src="home-assets/img/ajax-loading.gif" class="loading-indicator">');
      $('body').append(loadingIndicator);
    });

    displayedNewContent.done(function (newContent) {
      if (!isCurrentLocation(href)) {
        debugLoad('current location has changed; bailing from image load');
        return;
      }

      debugLoad('set content and fade in');
      $contentElem.html(newContent);

      // Remove the loading indicator if one was there
      if (loadingIndicator) {
        loadingIndicator.remove();
        loadingIndicator = null;
      }

      // Fade in the content element
      $contentElem.removeClass('faded-out hidden');

      waitFor(500).then(function () {
        if (!isCurrentLocation(href)) {
          debugLoad('current location has changed; bailing from fade-in');
          return;
        }

        debugLoad('fade-in complete');
        $contentElem.removeClass('fading');
      });
    });
  }

  function getNavLink(href) {
    return $('[data-region-id="page-header"] a[href="'+href+'"]');
  }

  function handlePopState(e) {
    var href = getDomainRelativeUrl(location.href);
    var newState;

    if (e.state != null) {
      newState = e.state;
    } else if (href === initialPageData.href) {
      /*
       * On PhantomJS (and maybe other Webkit permutations - who knows)
       * a popstate event is triggered sometime on initial navigation
       * with null state, even though replaceState is called before
       * the listener is added
       */
      newState = initialPageData.state;
    } else {
      location.reload();
      return;
    }

    loadPageContent(href, newState, getNavLink(href));
  }

  function setGlobalPageState(state) {
    if (state.title) {
      document.title = baseTitle + ' - ' + state.title;
    } else {
      document.title = baseTitle;
    }
  }

  function getContentElem() {
    var $contentElem = $('[data-region-id="primary-content"]');
    if ($contentElem.length === 0) return null;
    if ($contentElem.length > 1) return $contentElem.first();
    return $contentElem;
  }

  function waitFor(ms) {
    var q = new $.Deferred();
    setTimeout(function () {q.resolve();}, ms);
    return q;
  }
})(jQuery);
