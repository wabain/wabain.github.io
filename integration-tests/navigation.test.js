'use strict'

const { Builder, By, until } = require('selenium-webdriver')
const { StaleElementReferenceError } = require('selenium-webdriver/lib/error')
const expect = require('expect')

module.exports = function ({ origin, browser, siteMeta }) {
    describe('navigation', function () {
        const ctx = this
        ctx.timeout(10000)  // We're gonna be sloooow

        before(async () => {
            ctx.webdriver = new Builder()
                .forBrowser(browser)
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
    it('should reload when current page link is clicked', async () => {
        const window = ctx.siteWindow
        const page = new NavigablePage(pageParameters)

        await window.load({ page })
        await page.verifyBasicProperties({ window })

        const element = await page.findNavLinkToPage({
            domainRelativeUrl: page.params.url,
            window,
        })
        await element.click()

        const hasReloaded = await window.hasReloaded()
        expect(hasReloaded).toBe(true, 'Page should have reloaded')

        await page.verifyBasicProperties({ window })
    })

    it.skip('should do local navigation without reload', async () => {
        const window = ctx.siteWindow
        const secondPageParams = getTargetPageParams({
            currentPageParams: pageParameters
        })

        const firstPage = new NavigablePage(pageParameters)
        const secondPage = new NavigablePage(secondPageParams)

        await window.load({ page: firstPage })
        await firstPage.verifyBasicProperties({ window })

        await navigateToPage(window, firstPage, secondPage)
        await navigateToPage(window, secondPage, firstPage)
    })

    it.skip('should handle history navigation without reload', async () => {
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
            params => params !== currentPageParams
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

        // should have expected title
        const expectedTitle = new RegExp('^(\\[dev\\] )?William Bain - ' + this.params.title + '$')

        await driver.wait(until.titleMatches(expectedTitle), 1000)
            .catch(async () => {
                throw new Error(`Page title is "${await driver.getTitle()}", expected "${this.params.title}"`)
            })

        try {
            // should have new content
            const contentSection = await driver.findElement(By.css('[data-region-id="primary-content"]'), 1000)
            const transitionClass = /\bfaded\b/  // could use a nicer way to do this

            while (transitionClass.test(await contentSection.getAttribute('className'))) {
                await sleep(50)
            }
        } catch (e) {
            if ((e instanceof StaleElementReferenceError) && await window.hasReloaded()) {
                throw new Error('Unexpected window reload during test')
            }

            throw e
        }

        const pageMeta = await driver.findElement(By.css('[data-page-meta]'), 1000)
        const pageIdentifier = (await pageMeta.getAttribute('data-page-meta')) || ''

        expect(pageIdentifier).toBe(this.params.title, 'Unexpected page identifier')
    }

    async findNavLinkToPage({ domainRelativeUrl, window }) {
        const links = await window.getLinksOnPage(await this.getHeaderElement({ window }))
        const entry = links.find(({ href }) => href === window.origin + domainRelativeUrl)
        if (!entry) {
            const hrefs = links.map(({ href }) => href)
            throw new Error(`no usable link to ${domainRelativeUrl}; found ${JSON.stringify(hrefs)}`)
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

function sleep(ms) {
    return new Promise(resolve => {
        setTimeout(() => resolve(), ms)
    })
}

function asSlug(string = '') {
    return String(string).replace(/[\s\W-]+/g, '-')
}
