import { getDomainRelativeUrl, isRelativeHref } from './normalize-href';
import {
  AnimationDispatcher,
  updateProperty,
  reverseTween,
  classSet,
  appendElem,
} from './animation';

var CONTENT_VISIBLE = 'content-in';
var CONTENT_HIDDEN = 'content-out';
var CONTENT_LOADING = 'content-load';

(function ($) {
  'use strict';
  var baseTitle, $contentElem, cache, currentHref, dispatcher, pageContentAnimation;

  // Only initialize dynamic navigation if HTML5 history APIs are available
  if (window.history && window.history.pushState) {
    $contentElem = getContentElem();

    if ($contentElem) {
      // The base title is all text up to the final "-", excluding trailing whitespace
      baseTitle = (/(.*?)(?:\s*-[^-]*)?$/).exec(document.title)[1];

      // Initialize the content cache
      cache = {};

      // Initialize the navigation bindings
      initializeNavigation();
    }
  }

  function initializeNavigation() {
    currentHref = getDomainRelativeUrl(location.href);

    if (currentHref) {
      cache[currentHref] = $contentElem.html();
    }

    dispatcher = new AnimationDispatcher();
    pageContentAnimation = createPageContentAnimation(dispatcher, $contentElem[0]);

    // Bind local links in the header
    $('.header-block a[href]').filter(function () {
      return isRelativeHref($(this).attr('href'));
    }).on('click', doDynamicNavigation);
  }

  function doDynamicNavigation(e) {
    var $elem = $(e.currentTarget),
        href = getDomainRelativeUrl($elem.attr('href')),
        navLink,
        specificTitle,
        cached,
        hasNewContent,
        displayedNewContent;

    // If the current href is the same as the one which was clicked, return
    // and let the page reload. The rationale is that if the user is continuing
    // to click, then the page probably hasn't been responding as desired.
    if (currentHref === href)
      return;

    currentHref = href;

    // If the href is null (perhaps because it was absolute) then return
    // and let the default occur.
    if (!href)
      return;

    // Stop the page from reloading
    e.preventDefault();

    // If the content for this page is already cached, then take the cached value.
    // Otherwise, make a request for it.
    cached = cache.hasOwnProperty(href);
    if (cached) {
      hasNewContent = [cache[href], 'success', null];
    } else {
      var cacheUrl = '/section-partial' + (href === '/' ? '/index.html' : href);
      hasNewContent = $.get(cacheUrl);
    }

    var fadeOutComplete = promiseToDeferred(pageContentAnimation.goto(CONTENT_HIDDEN));
    var hiddenStateId = pageContentAnimation.stateId;

    // Update the links in the navbar
    navLink = $('nav a[href="'+href+'"]');
    $('nav a[href]').not(navLink).removeClass('active-link');
    if (navLink.length > 0) {
      navLink.addClass('active-link');
    } else {
      navLink = null;
    }

    // Update the URL and document title
    window.history.pushState(null, document.title, href);

    specificTitle = (navLink || $elem).attr('data-pagetitle') || (navLink || $elem).text();
    document.title = baseTitle + ' - ' + specificTitle;

    // Wait for at least 500ms and for the new content to load
    displayedNewContent = $.when(hasNewContent, fadeOutComplete);

    // If loading takes at least 750ms then show a loading indicator
    waitFor(750).then(function () {
      if (pageContentAnimation.stateId !== hiddenStateId)
        return;

      pageContentAnimation.goto(CONTENT_LOADING);
    });

    displayedNewContent.done(function (ajaxData) {
      var newContent = ajaxData[0];

      // Cache the content
      if (!cached)
        cache[href] = newContent;

      // If the href has changed in the mean time then don't display the new content
      if (currentHref !== href)
        return;

      // Load the content on the page
      $contentElem.html(newContent);

      pageContentAnimation.goto(CONTENT_VISIBLE);
    }).fail(function () {
      // On failure just go to the referenced location
      window.location = href;
    });
  }

  function getContentElem() {
    var $contentElem = $('section.content');
    if ($contentElem.length === 0) return null;
    if ($contentElem.length > 1) return $contentElem.first();
    return $contentElem;
  }

  function waitFor(ms) {
    var q = new $.Deferred();
    setTimeout(function () {q.resolve();}, ms);
    return q;
  }

  function promiseToDeferred(promise) {
    var q = new $.Deferred();
    promise.then(function (res) {
      q.resolve(res);
    }, function (err) {
      q.reject(err);
    });
    return q;
  }
})(jQuery);

function createPageContentAnimation(dispatcher, contentElem) {
  var contentFadeTween = updateProperty({
    el: contentElem,
    prop: 'opacity',
    start: 1,
    end: 0,
    duration: 500,
  });

  var transitions = [
    {
      from: CONTENT_VISIBLE,
      to: CONTENT_HIDDEN,
      tween: contentFadeTween,
      bidir: true,
    },
    {
      from: CONTENT_HIDDEN,
      to: CONTENT_LOADING,
    },
    {
      from: CONTENT_LOADING,
      to: CONTENT_VISIBLE,
      tween: reverseTween(contentFadeTween),
    }
  ];

  var states = [
    {
      name: CONTENT_VISIBLE,
      action: null,
    },
    {
      name: CONTENT_HIDDEN,
      action: classSet({
        el: contentElem,
        cls: 'hidden',
      }),
    },
    {
      name: CONTENT_LOADING,
      action: appendElem({
        parent: document.body,
        getEl: function () {
          var loadingIndicator =
                jQuery('<img src="home-assets/img/ajax-loading.gif" class="loading-indicator">');
          return loadingIndicator[0];
        },
      })
    }
  ];

  return dispatcher.add(transitions, states, CONTENT_VISIBLE);
}
