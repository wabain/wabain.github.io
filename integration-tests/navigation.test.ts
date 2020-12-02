import { it, jest, describe, beforeAll, afterAll, expect } from '@jest/globals'

import {
    Builder,
    By,
    WebDriver,
    WebElement,
    until,
    error as SeleniumErrors,
} from 'selenium-webdriver'
import { Options as FirefoxOptions } from 'selenium-webdriver/firefox'
import { Options as ChromeOptions } from 'selenium-webdriver/chrome'

import { BROWSER, ORIGIN, SITE_META_PATH } from './env'

type TestMeta = { pages: PageParameters[] }

type PageParameters = {
    url: string
    title: string | null
    in_nav: boolean
    nav_priority: number | null
}

const { StaleElementReferenceError } = SeleniumErrors

// Updated from 10s when migrating CI to GitHub Actions; would be nice to have it
// lower
jest.setTimeout(30000)

describe('navigation', function () {
    let webdriver: WebDriver = new Builder()
        .forBrowser(BROWSER)
        .setFirefoxOptions(new FirefoxOptions().headless())
        .setChromeOptions(new ChromeOptions().headless())
        .build()

    beforeAll(async () => {
        // wait for the concrete driver to be resolved before proceeding
        webdriver = await webdriver
    })

    afterAll(() => webdriver.quit())

    const siteMeta: TestMeta = require(SITE_META_PATH)

    for (const pageParameters of siteMeta.pages) {
        describe(`page ${pageParameters.url}`, () => {
            testPageNavigation({
                driver: webdriver,
                origin: ORIGIN,
                pageParameters,
                siteMeta,
            })
        })
    }
})

/**
 * Test navigation from the given page
 */
function testPageNavigation({
    driver,
    origin,
    pageParameters,
    siteMeta,
}: {
    driver: WebDriver
    origin: string
    pageParameters: PageParameters
    siteMeta: TestMeta
}): void {
    it('should reload when current page link is clicked', async function () {
        const window = await SiteWindow.forCurrentDriverWindow({
            origin,
            driver,
        })

        const page = new NavigablePage(pageParameters)

        await window.load({ page })
        await page.verifyBasicProperties({ window })

        const element = await page.findNavLinkToPage({
            domainRelativeUrl: page.params.url,
            window,
        })

        driver = await window.resolveDriver()
        const selector = element
            ? await getElementSelector(driver, element)
            : null

        expect(selector).toMatchSnapshot('self-link selector')

        if (!element) {
            return
        }

        await element.click()

        const hasReloaded = await window.hasReloaded()
        expect(hasReloaded).toBe(true)

        await page.verifyBasicProperties({ window })
    })

    it('should do local navigation without reload', async function () {
        const window = await SiteWindow.forCurrentDriverWindow({
            origin,
            driver,
        })

        const secondPageParams = getTargetPageParams({
            currentPageParams: pageParameters,
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

    it('should handle history navigation without reload', async function () {
        const window = await SiteWindow.forCurrentDriverWindow({
            origin,
            driver,
        })

        const secondPageParams = getTargetPageParams({
            currentPageParams: pageParameters,
        })

        const firstPage = new NavigablePage(pageParameters)
        const secondPage = new NavigablePage(secondPageParams)

        /* Load first page */
        await window.load({ page: firstPage })
        await firstPage.verifyBasicProperties({ window })

        /* Navigate to second */
        await navigateToPage(window, firstPage, secondPage)

        /* Go back/forwards (content should be cached) */
        await jumpHistory({ window, expectedPage: firstPage })
        await jumpHistory({ window, expectedPage: secondPage, goForward: true })

        /* Refresh and revalidate (necessary to avoid race conditions) */
        driver = await window.resolveDriver()
        await driver.navigate().refresh()

        expect(await window.hasReloaded()).toBe(true)
        await window.installSentinel()

        await secondPage.verifyBasicProperties({ window })

        /* Go back (will require a new request) */
        await jumpHistory({ window, expectedPage: firstPage })
    })

    async function navigateToPage(
        window: SiteWindow,
        currentPage: NavigablePage,
        targetPage: NavigablePage,
    ): Promise<void> {
        const element = await currentPage.findNavLinkToPage({
            domainRelativeUrl: targetPage.params.url,
            window,
        })
        if (!element) {
            // If changing the message, check if any code relies on it
            throw new Error(`no usable link to ${targetPage.params.url}`)
        }

        await element.click()

        await targetPage.verifyBasicProperties({ window })
        expect(await window.hasReloaded()).toBe(false)
    }

    async function jumpHistory({
        window,
        goForward = false,
        expectedPage,
    }: {
        window: SiteWindow
        goForward?: boolean
        expectedPage: NavigablePage
    }): Promise<void> {
        const driver = await window.resolveDriver()

        if (goForward) {
            await driver.navigate().forward()
        } else {
            await driver.navigate().back()
        }

        await expectedPage.verifyBasicProperties({ window })
        expect(await window.hasReloaded()).toBe(false)
    }

    function getTargetPageParams({
        currentPageParams,
    }: {
        currentPageParams: PageParameters
    }): PageParameters {
        const params = siteMeta.pages.find(
            (params) => params !== currentPageParams && params['in_nav'],
        )
        if (params) {
            return params
        }
        throw new Error('no usable page')
    }
}

class SiteWindow {
    static screenshotCount = 0

    origin: string
    handle: string
    private _driver: WebDriver

    static async forCurrentDriverWindow({
        origin,
        driver,
    }: {
        origin: string
        driver: WebDriver
    }): Promise<SiteWindow> {
        return new SiteWindow({
            origin,
            driver,
            handle: await driver.getWindowHandle(),
        })
    }

    constructor({
        origin,
        driver,
        handle,
    }: {
        origin: string
        driver: WebDriver
        handle: string
    }) {
        this.origin = origin
        this._driver = driver
        this.handle = handle
    }

    async resolveDriver(): Promise<WebDriver> {
        const currentHandle = await this._driver.getWindowHandle()
        if (this.handle !== currentHandle) {
            throw new Error(
                `Expected current window to be ${this.handle} but got ${currentHandle}`,
            )
        }
        return this._driver
    }

    async load({ page }: { page: NavigablePage }): Promise<void> {
        const driver = await this.resolveDriver()
        await driver.get(page.getQualifiedUrl({ window: this }))

        try {
            // Verify that the dynamic navigation code ran successfully
            await driver.wait(
                async () => await driver.executeScript('return !!window.__nav'),
                1000,
            )
        } catch (e) {
            throw new Error(
                'did not see dynamic navigation initialized on page load',
            )
        }

        await this.installSentinel()
    }

    async installSentinel(): Promise<void> {
        const driver = await this.resolveDriver()
        await driver.executeScript('window.__navTestSentinel = true')
    }

    async hasReloaded(): Promise<boolean> {
        const driver = await this.resolveDriver()
        const sentinel = await driver.executeScript(
            'return !!window.__navTestSentinel',
        )
        return !sentinel
    }

    async getLinksOnPage(
        element: WebElement | null = null,
    ): Promise<{ elem: WebElement; href: string }[]> {
        const searchRoot = element || (await this.resolveDriver())
        const elements = await searchRoot.findElements(By.css('a'))
        return await Promise.all(
            elements.map(async (el) => ({
                elem: el,
                href: await el.getAttribute('href'),
            })),
        )
    }

    async dumpScreenshot(slug: string): Promise<void> {
        const driver = await this.resolveDriver()
        SiteWindow.screenshotCount++
        const idx = SiteWindow.screenshotCount
        const png = await driver.takeScreenshot()
        const filename = `screenshot-${idx}-${asSlug(slug)}.png`

        require('fs').writeFileSync(filename, new Buffer(png, 'base64'))
    }
}

class NavigablePage {
    params: PageParameters

    constructor(pageParameters: PageParameters) {
        this.params = pageParameters
    }

    getQualifiedUrl({ window }: { window: SiteWindow }): string {
        return window.origin + this.params.url
    }

    async verifyBasicProperties({
        window,
    }: {
        window: SiteWindow
    }): Promise<void> {
        const driver = await window.resolveDriver()

        // should have requested URL
        await driver.wait(until.urlIs(this.getQualifiedUrl({ window })), 1000)

        try {
            // should have expected title
            const expectedTitle = new RegExp(
                '^(\\[dev\\] )?William Bain - ' + this.params.title + '$',
            )

            await driver.wait(until.titleMatches(expectedTitle), 1000)
        } catch (e) {
            throw new Error(
                `Page title is "${await driver.getTitle()}", expected ` +
                    `"${this.params.title}"`,
            )
        }

        try {
            await driver.wait(
                async () => this._hasExpectedPageIdentifier(driver),
                1000,
            )
        } catch (e) {
            throw new Error(
                `Loaded page content is for "${await this._getPageIdentifier(
                    driver,
                )}", ` + `expected "${this.params.title}"`,
            )
        }
    }

    private async _hasExpectedPageIdentifier(
        driver: WebDriver,
    ): Promise<boolean> {
        const identifier = await this._getPageIdentifier(driver)
        return identifier == this.params.title
    }

    private async _getPageIdentifier(
        driver: WebDriver,
    ): Promise<string | null> {
        try {
            const pageMeta = await driver.findElement(
                By.css('[data-page-meta]'),
            )
            return (await pageMeta.getAttribute('data-page-meta')) || ''
        } catch (e) {
            if (e instanceof StaleElementReferenceError) {
                return null
            }
            throw e
        }
    }

    async findNavLinkToPage({
        domainRelativeUrl,
        window,
    }: {
        domainRelativeUrl: string
        window: SiteWindow
    }): Promise<WebElement | null> {
        const links = await window.getLinksOnPage(
            await this.getHeaderElement({ window }),
        )
        const entry = links.find(
            ({ href }) => href === window.origin + domainRelativeUrl,
        )
        if (!entry) {
            return null
        }
        return entry.elem
    }

    async getHeaderElement({
        window,
    }: {
        window: SiteWindow
    }): Promise<WebElement> {
        const driver = await window.resolveDriver()
        const elem = await driver.findElement(
            By.css('[data-region-id="page-header"]'),
        )
        if (!elem) {
            throw new Error('Could not find header')
        }
        return elem
    }
}

async function getElementSelector(
    driver: WebDriver,
    node: WebElement,
): Promise<string> {
    const path: string = await driver.executeScript(
        `
        'use strict'

        let node = arguments[0]
        let path = ''

        while (node) {
            const parent = node.parentElement

            let name = node.tagName

            if (!name) {
                break
            }

            name = name.toLowerCase()

            if (node.id) {
                name += '#' + id
            } else if (!isOnlyChildWithTag(node)) {
                const index = [...parent.children].findIndex((c) => c === node)

                switch (index) {
                case -1:
                    throw new Error('missing child ' + node)

                case 0:
                    name += ':first-child'
                    break

                default:
                    name += ':nth-child(' + (index+1) + ')'
                    break
                }
            }

            path = name + (path ? '>' + path : '')
            node = parent
        }

        function isOnlyChildWithTag(node) {
            const parent = node.parentElement

            if (!parent) {
                return true
            }

            const children = [...parent.children]
            return !children.some((c) => c !== node && c.tagName === node.tagName)
        }

        return path
        `,
        node,
    )

    return path
}

function asSlug(string = ''): string {
    return String(string).replace(/[\s\W-]+/g, '-')
}
