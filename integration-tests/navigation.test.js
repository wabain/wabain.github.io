'use strict'

const { Builder, By, until } = require('selenium-webdriver')
const expect = require('expect')

module.exports = function ({ origin, browser, siteMeta }) {
    describe('navigation', function () {
        const ctx = this
        ctx.timeout(10000)  // We're gonna be sloooow

        before(() => {
            ctx.webdriver = new Builder()
                .forBrowser(browser)
                .build()
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
function testPageNavigation({ ctx, origin, pageParameters, siteMeta }) {
    it('should reload when current page link is clicked', async () => {
        const page = await NavigablePage.load({
            origin,
            driver: ctx.webdriver,
            pageParameters,
        })

        await page.verifyBasicProperties()

        const element = await page.findNavLinkToPage(pageParameters)
        const reloadedPage = await page.navigateToSameOriginLink(element, pageParameters)

        const hasReloaded = await reloadedPage.hasReloaded()
        expect(hasReloaded).toBe(true, 'Page should have reloaded')
    })

    it('should do local navigation without reload', async () => {
        const secondPageParams = getTargetPage({
            currentPageParams: pageParameters
        })

        const firstPage = await NavigablePage.load({
            origin,
            driver: ctx.webdriver,
            pageParameters,
        })

        await firstPage.verifyBasicProperties()

        const secondPage = await navigateToPage(firstPage, secondPageParams)
        await navigateToPage(secondPage, pageParameters)

        async function navigateToPage(currentPage, targetParameters) {
            const element = await currentPage.findNavLinkToPage(targetParameters)
            const targetPage = await currentPage.navigateToSameOriginLink(element, targetParameters)

            await targetPage.verifyBasicProperties()
            expect(await targetPage.hasReloaded()).toBe(
                false,
                'Page should not have reloaded')

            return targetPage
        }

        function getTargetPage({ currentPageParams }) {
            const params = siteMeta.pages.find(
                params => params !== currentPageParams
            )
            if (params) {
                return params
            }
            throw new Error('no usable page')
        }
    })

    describe('external links', function() {
        let page

        before(async () => {
            page = await NavigablePage.load({
                origin,
                driver: ctx.webdriver,
                pageParameters,
            })

            await page.verifyBasicProperties()
        })

        it('should always have target=_blank', async () => {
            const externalLinks = (await page.getLinksOnPage()).filter(
                ({ href }) => !href.startsWith(page.origin)
            )

            for (const link of externalLinks) {
                expect(await link.elem.getAttribute('target')).toBe(
                    '_blank',
                    `Target of link to ${link.href}`)
            }
        })
    })
}

class NavigablePage {
    static async load({ origin, driver, pageParameters }) {
        const requestedUrl = origin + pageParameters.url

        await driver.get(requestedUrl)
        const page = new NavigablePage({
            pageParameters,
            requestedUrl,
            origin,
            driver,
        })
        await page.installSentinel()
        return page
    }

    constructor({ pageParameters, requestedUrl, origin, driver }) {
        this.params = pageParameters
        this.requestedUrl = requestedUrl
        this.origin = origin
        this.driver = driver
    }

    async installSentinel() {
        this.driver.executeScript('window.__navTestSentinel = true')
    }

    async hasReloaded() {
        const sentinel = await this.driver.executeScript('return !!window.__navTestSentinel')
        return !sentinel
    }

    async verifyBasicProperties() {
        // should have requested URL
        await this.driver.wait(until.urlIs(this.requestedUrl))

        // should have expected title
        const expectedTitle = new RegExp('^(\\[dev\\] )?William Bain - ' + this.params.title + '$')

        await this.driver.wait(until.titleMatches(expectedTitle), 1000)
            .catch(async () => {
                throw new Error(`Page title is "${await this.driver.getTitle()}"`)
            })

        // should have new content
        const contentSection = await this.driver.findElement(By.css('section.content'), 1000)
        const transitionClass = /\bfaded\b/  // could use a nicer way to do this

        while (transitionClass.test(await contentSection.getAttribute('className'))) {
            await sleep(50)
        }

        const contentTitle = await this.driver.findElement(By.css('section.content > h2'), 1000)

        // FIXME: titleText is intermittently empty. Maybe a race condition
        // I'm missing, or a webdriver bug (w/ chrome)?
        let titleText
        let titleLookupCount = 0

        do {
            titleText = (await contentTitle.getText()).trim()
            titleLookupCount++
        } while (titleText === '' && titleLookupCount < 5)

        expect(titleText).toBe(this.params.title, 'Unexpected content title')
    }

    async findNavLinkToPage(targetPage) {
        const links = await this.getLinksOnPage(await this.getHeaderElement())
        const entry = links.find(({ href }) => href === this.origin + targetPage.url)
        if (!entry) {
            const hrefs = links.map(({ href }) => href)
            throw new Error(`no usable link to ${targetPage.url}; found ${JSON.stringify(hrefs)}`)
        }
        return entry.elem
    }

    async getHeaderElement() {
        const elem = await this.driver.findElement(By.css('header.header-block'))
        if (!elem) {
            throw new Error('Could not find header')
        }
        return elem
    }

    async getLinksOnPage(element = null) {
        const searchRoot = element || this.driver
        const elements = await searchRoot.findElements(By.css('a'))
        return await Promise.all(elements.map(
            async el => ({ elem: el, href: await el.getAttribute('href') })
        ))
    }

    async navigateToSameOriginLink(element, pageParameters) {
        expect(await element.getTagName()).toBe('a')
        const requestedUrl = await element.getAttribute('href')
        await element.click()

        return new NavigablePage({
            pageParameters,
            requestedUrl,
            origin: this.origin,
            driver: this.driver,
        })
    }

    async dumpScreenshot(slug) {
        NavigablePage.screenshotCount++
        const idx = NavigablePage.screenshotCount

        const png = await this.driver.takeScreenshot()
        const titleSlug = this.params.title.toLowerCase()

        const filename =
            `screenshot-${idx}-${asSlug(titleSlug)}-${asSlug(slug)}.png`

        require('fs').writeFileSync(filename, new Buffer(png, 'base64'))
    }
}

NavigablePage.screenshotCount = 0

function sleep(ms) {
    return new Promise(resolve => {
        setTimeout(() => resolve(), ms)
    })
}

function asSlug(string = '') {
    return String(string).replace(/[\s\W-]+/g, '-')
}
