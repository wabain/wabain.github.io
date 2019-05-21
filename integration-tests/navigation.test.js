'use strict'

const { Builder, By, until } = require('selenium-webdriver')
const { StaleElementReferenceError } = require('selenium-webdriver/lib/error')
const { Options: FirefoxOptions } = require('selenium-webdriver/firefox')
const { Options: ChromeOptions } = require('selenium-webdriver/chrome')
const expect = require('expect')

module.exports = function ({ origin, browser, siteMeta }) {
    describe('navigation', function () {
        const ctx = this
        ctx.timeout(10000)  // We're gonna be sloooow

        before(async () => {
            ctx.webdriver = new Builder()
                .forBrowser(browser)
                .setFirefoxOptions((new FirefoxOptions()).headless())
                .setChromeOptions((new ChromeOptions()).headless())
                .build()

            ctx.siteWindow = await SiteWindow.forCurrentDriverWindow({
                origin,
                driver: ctx.webdriver,
            })
        })

        after(() => {
            ctx.webdriver.quit()
        })

        for (const pageParameters of siteMeta.pages) {
            describe(`page ${pageParameters.url}`, () => {
                testPageNavigation({ ctx, origin, pageParameters, siteMeta })
            })
        }
    })
}

/**
 * Test navigation from the given page
 */
function testPageNavigation({ ctx, pageParameters, siteMeta }) {
    it('should reload when current page link is clicked', async function() {
        const window = ctx.siteWindow
        const page = new NavigablePage(pageParameters)

        await window.load({ page })
        await page.verifyBasicProperties({ window })

        const element = await page.findNavLinkToPage({
            domainRelativeUrl: page.params.url,
            window,
        })

        if (!element) {
            this.skip()
            return
        }

        await element.click()

        const hasReloaded = await window.hasReloaded()
        expect(hasReloaded).toBe(true, 'Page should have reloaded')

        await page.verifyBasicProperties({ window })
    })

    it('should do local navigation without reload', async function() {

        // Occasionally, the Jekyll server seems to fail when a page partial
        // is requested. This results in the dynamic navigation code performing
        // its fallback action, which is to reload. I don't have the time or
        // inclination to track down why this happens, so I'm just adding
        // a retry for now. Apart from fixing this, or not using jekyll's
        // embedded server, my best mitigation idea is to stick some tracing
        // data in localStorage so I can detect the failure cause.
        this.retries(2)

        const window = ctx.siteWindow
        const secondPageParams = getTargetPageParams({
            currentPageParams: pageParameters
        })

        const firstPage = new NavigablePage(pageParameters)
        const secondPage = new NavigablePage(secondPageParams)

        await window.load({ page: firstPage })
        await firstPage.verifyBasicProperties({ window })

        await navigateToPage(window, firstPage, secondPage)

        try {
            await navigateToPage(window, secondPage, firstPage)
        } catch (e) {
            // If there's no back-link, disregard the error
            if (e.message != `no usable link to ${firstPage.params.url}`) {
                throw e
            }
        }
    })

    it('should handle history navigation without reload', async function() {

        // See comment on "...should do local navigation without reload"
        this.retries(2)

        const window = ctx.siteWindow
        const secondPageParams = getTargetPageParams({
            currentPageParams: pageParameters
        })

        const firstPage = new NavigablePage(pageParameters)
        const secondPage = new NavigablePage(secondPageParams)

        /* Load first page */
        await window.load({ page: firstPage })
        await firstPage.verifyBasicProperties({ window })

        /* Navigate to second */
        await navigateToPage(window, firstPage, secondPage)

        /* Go back/forwards (content should be cached) */
        await jumpHistory({ window, targetPage: firstPage })
        await jumpHistory({ window, targetPage: secondPage, goForward: true })

        /* Refresh and revalidate (necessary to avoid race conditions) */
        const driver = await window.resolveDriver()
        await driver.navigate().refresh()

        expect(await window.hasReloaded()).toBe(true, 'Page should have reloaded')
        await window.installSentinel()

        await secondPage.verifyBasicProperties({ window })

        /* Go back (will require a new request) */
        await jumpHistory({ window, targetPage: firstPage })
    })

    describe('external links', function() {
        let page
        let window

        before(async () => {
            window = ctx.siteWindow
            page = new NavigablePage(pageParameters)
            await window.load({ page })
            await page.verifyBasicProperties({ window })
        })

        it('should always have target=_blank', async () => {
            const externalLinks = (await window.getLinksOnPage()).filter(
                ({ href }) => !href.startsWith(window.origin)
            )

            for (const link of externalLinks) {
                expect(await link.elem.getAttribute('target')).toBe(
                    '_blank',
                    `Target of link to ${link.href}`)
            }
        })
    })

    async function navigateToPage(window, currentPage, targetPage) {
        const element = await currentPage.findNavLinkToPage({
            domainRelativeUrl: targetPage.params.url,
            window
        })
        if (!element) {
            // If changing the message, check if any code relies on it
            throw new Error(`no usable link to ${targetPage.params.url}`)
        }

        await element.click()

        await targetPage.verifyBasicProperties({ window })
        expect(await window.hasReloaded()).toBe(
            false,
            'Page should not have reloaded')
    }

    async function jumpHistory({ window, goForward = false, targetPage }) {
        const driver = await window.resolveDriver()

        if (goForward) {
            await driver.navigate().forward()
        } else {
            await driver.navigate().back()
        }

        await targetPage.verifyBasicProperties({ window })
        expect(await window.hasReloaded()).toBe(
            false,
            'Page should not have reloaded')
    }

    function getTargetPageParams({ currentPageParams }) {
        const params = siteMeta.pages.find(
            params => params !== currentPageParams && params['in_nav']
        )
        if (params) {
            return params
        }
        throw new Error('no usable page')
    }
}

class SiteWindow {
    static async forCurrentDriverWindow({ origin, driver }) {
        return new SiteWindow({
            origin,
            driver,
            handle: await driver.getWindowHandle()
        })
    }

    constructor({ origin, driver, handle }) {
        this.origin = origin
        this._driver = driver
        this.handle = handle
    }

    async resolveDriver() {
        const currentHandle = await this._driver.getWindowHandle()
        if (this.handle !== currentHandle) {
            throw new Error(`Expected current window to be ${this.handle} but got ${currentHandle}`)
        }
        return this._driver
    }

    async load({ page }) {
        const driver = await this.resolveDriver()
        await driver.get(page.getQualifiedUrl({ window: this }))

        try {
            // Verify that the dynamic navigation code ran successfully
            await driver.wait(async () => (
                await driver.executeScript('return !!window.__nav')
            ), 1000)
        } catch (e) {
            throw new Error('did not see dynamic navigation initialized on page load')
        }

        await this.installSentinel()
    }

    async installSentinel() {
        const driver = await this.resolveDriver()
        await driver.executeScript('window.__navTestSentinel = true')
    }

    async hasReloaded() {
        const driver = await this.resolveDriver()
        const sentinel = await driver.executeScript('return !!window.__navTestSentinel')
        return !sentinel
    }

    async getLinksOnPage(element = null) {
        const searchRoot = element || await this.resolveDriver()
        const elements = await searchRoot.findElements(By.css('a'))
        return await Promise.all(elements.map(
            async el => ({ elem: el, href: await el.getAttribute('href') })
        ))
    }

    async dumpScreenshot(slug) {
        const driver = await this.resolveDriver()
        SiteWindow.screenshotCount++
        const idx = SiteWindow.screenshotCount
        const png = await driver.takeScreenshot()
        const filename = `screenshot-${idx}-${asSlug(slug)}.png`

        require('fs').writeFileSync(filename, new Buffer(png, 'base64'))
    }
}

SiteWindow.screenshotCount = 0

class NavigablePage {
    constructor(pageParameters) {
        this.params = pageParameters
    }

    getQualifiedUrl({ window }) {
        return window.origin + this.params.url
    }

    async verifyBasicProperties({ window }) {
        const driver = await window.resolveDriver()

        // should have requested URL
        await driver.wait(until.urlIs(this.getQualifiedUrl({ window })), 1000)

        try {
            // should have expected title
            const expectedTitle = new RegExp('^(\\[dev\\] )?William Bain - ' + this.params.title + '$')

            await driver.wait(until.titleMatches(expectedTitle), 1000)
        } catch (e) {
            throw new Error(
                `Page title is "${await driver.getTitle()}", expected ` +
                `"${this.params.title}"`,
            )
        }

        try {
            await driver.wait(async () => this._hasExpectedPageIdentifier(driver), 1000)
        } catch (e) {
            throw new Error(
                `Loaded page content is for "${await this._getPageIdentifier(driver)}", ` +
                `expected "${this.params.title}"`,
            )
        }
    }

    async _hasExpectedPageIdentifier(driver) {
        const identifier = await this._getPageIdentifier(driver)
        return identifier == this.params.title
    }

    async _getPageIdentifier(driver) {
        try {
            const pageMeta = await driver.findElement(By.css('[data-page-meta]'), 1000)
            return (await pageMeta.getAttribute('data-page-meta')) || ''
        } catch (e) {
            if ((e instanceof StaleElementReferenceError)) {
                return null
            }
            throw e
        }
    }

    async findNavLinkToPage({ domainRelativeUrl, window }) {
        const links = await window.getLinksOnPage(await this.getHeaderElement({ window }))
        const entry = links.find(({ href }) => href === window.origin + domainRelativeUrl)
        if (!entry) {
            return null
        }
        return entry.elem
    }

    async getHeaderElement({ window }) {
        const driver = await window.resolveDriver()
        const elem = await driver.findElement(By.css('[data-region-id="page-header"]'))
        if (!elem) {
            throw new Error('Could not find header')
        }
        return elem
    }
}

function asSlug(string = '') {
    return String(string).replace(/[\s\W-]+/g, '-')
}
