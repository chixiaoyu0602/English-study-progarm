import { test, expect } from '@playwright/test'
import { fresh, select, body } from './helpers'

test('pen cursors show width and current color over both plain and highlighted text', async ({ page }) => {
  await fresh(page)
  await expect(body(page)).toHaveCSS('cursor', 'text')
  await page.getByRole('button', { name: '粗记号笔', exact: true }).click()
  const wide = await body(page).evaluate(el => getComputedStyle(el).cursor)
  expect(decodeURIComponent(wide)).toContain('data-tool="wide"')
  expect(decodeURIComponent(wide)).toContain('#f3cf62')
  await page.getByRole('button', { name: '珊瑚红', exact: true }).click()
  const red = await body(page).evaluate(el => getComputedStyle(el).cursor)
  expect(decodeURIComponent(red)).toContain('#f09a91')
  expect(red).not.toBe(wide)
  await select(page, 'puma')
  await page.getByRole('button', { name: '细记号笔', exact: true }).click()
  const fine = await body(page).evaluate(el => getComputedStyle(el).cursor)
  expect(decodeURIComponent(fine)).toContain('data-tool="fine"')
  await expect(page.locator('.ink')).toHaveCSS('cursor', fine)
  await page.keyboard.press('Escape')
  await expect(page.locator('.ink')).toHaveCSS('cursor', 'text')
})
