import { test, expect, type Page } from '@playwright/test'
import { body, fresh, select, openAnalysis, panel } from './helpers'

async function caretBefore(page: Page, text: string) {
  await body(page).evaluate((root, target) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const node = walker.currentNode, index = node.textContent!.indexOf(target)
      if (index < 0) continue
      const range = document.createRange(); range.setStart(node, index); range.collapse(true)
      const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range)
      return
    }
    throw new Error('Caret target not found')
  }, text)
  await expect(page.locator('.tool-hint')).not.toContainText('选择一支记号笔')
}

test('single-word highlights cannot open analysis with a mouse or keyboard; empty phrases can', async ({ page }) => {
  await fresh(page, "saw don't well-known a large cat")
  for (const word of ['saw', "don't", 'well-known']) {
    await select(page, word)
    await page.getByRole('button', { name: '粗记号笔', exact: true }).click()
  }
  await expect(page.getByRole('button', { name: '打开片段分析', exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  for (const block of await page.locator('.ink-surface').all()) {
    await expect(block).not.toHaveAttribute('data-analysis-id')
    await expect(block).not.toHaveAttribute('tabindex')
    await block.click()
    await expect(panel(page)).toHaveCount(0)
  }
  await select(page, 'a large cat')
  await page.getByRole('button', { name: '粗记号笔', exact: true }).click()
  await expect(page.getByRole('button', { name: '打开片段分析', exact: true })).toHaveCount(1)
  await openAnalysis(page)
  await expect(panel(page).locator('.analysis-text')).toHaveText('a large cat')
  await expect(panel(page).locator('[data-detail-ink]')).toHaveCount(0)
})

test('sentence reading preserves source, clipboard, annotations and undo while remembering the chosen view', async ({ page }) => {
  const source = 'Mr. Smith paid $3.50. Another sentence here. Final sentence!'
  await fresh(page, source)
  await expect(page.locator('.sentence-number')).toHaveCount(3)
  await expect(body(page)).toHaveText(source)
  await select(page, 'Another sentence')
  await page.getByRole('button', { name: '粗记号笔', exact: true }).click()
  await page.getByRole('button', { name: '原文', exact: true }).click()
  await expect(page.locator('.sentence-number')).toHaveCount(0)
  await expect(body(page)).toHaveText(source)
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(page.locator('.ink')).toHaveCount(0)
  await page.getByRole('button', { name: '重做', exact: true }).click()
  await expect(page.locator('.ink')).toHaveText('Another sentence')
  await expect(page.getByRole('status').filter({ hasText: '已保存到本机' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: '原文', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '逐句', exact: true }).click()
  await expect(page.locator('.sentence-number')).toHaveCount(3)
  await expect(page.locator('.ink')).toHaveText('Another sentence')
  await select(page, source)
  const copied = await body(page).evaluate(el => {
    const data = new DataTransfer()
    el.dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }))
    return data.getData('text/plain')
  })
  expect(copied).toBe(source)
  await expect(body(page)).toHaveText(source)
})

test('manual merge, split and reset persist, survive source editing and travel in backups', async ({ page }) => {
  const source = 'One sentence. Another sentence here. Final sentence!'
  await fresh(page, source)
  await page.getByRole('button', { name: '第 2 句分句选项' }).click()
  await page.getByRole('menuitem', { name: '与上一句合并' }).click()
  await expect(page.locator('.sentence-number')).toHaveCount(2)
  await expect(body(page)).toHaveText(source)
  await expect(page.getByRole('status').filter({ hasText: '已保存到本机' })).toBeVisible()
  await page.reload()
  await expect(page.locator('.sentence-number')).toHaveCount(2)
  await select(page, 'One')
  await page.keyboard.type('Opening')
  await expect(page.locator('.sentence-number')).toHaveCount(2)
  await caretBefore(page, 'Another')
  await page.getByRole('button', { name: '第 1 句分句选项' }).click()
  await page.getByRole('menuitem', { name: '在文字光标处分句' }).click()
  await expect(page.locator('.sentence-number')).toHaveCount(3)
  await page.getByRole('button', { name: '第 3 句分句选项' }).click()
  await page.getByRole('menuitem', { name: '与上一句合并' }).click()
  await expect(page.locator('.sentence-number')).toHaveCount(2)
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出备份' }).click()
  await page.locator('input[type=file]').setInputFiles((await (await downloadPromise).path())!)
  await expect(page.locator('.sentence-number')).toHaveCount(2)
  await page.getByRole('button', { name: '第 1 句分句选项' }).click()
  await page.getByRole('menuitem', { name: '恢复本篇自动分句' }).click()
  await expect(page.locator('.sentence-number')).toHaveCount(3)
  await expect(body(page)).toHaveText(source.replace('One', 'Opening'))
})

test('single-word saved detail data survives even though its entry is hidden', async ({ page }) => {
  await fresh(page)
  await expect(page.getByRole('status').filter({ hasText: '已保存到本机' })).toBeVisible()
  const root = { id: 'single', color: '#f3cf62', width: 'wide' }, detail = { id: 'detail', parent: 'single', color: '#f09a91', width: 'fine' }
  const book = await page.evaluate(() => JSON.parse(localStorage.getItem('marknote.notebook.v1')!))
  book.notes = [{ id: 'single-note', title: 'Saved word', createdAt: 1, updatedAt: 1, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'saw', marks: [{ type: 'ink', attrs: { color: detail.color, width: detail.width, layers: [root, detail] } }] }] }] } }]
  book.activeId = 'single-note'
  await page.locator('input[type=file]').setInputFiles({ name: 'saved.marknote', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(book)) })
  await expect(page.getByRole('button', { name: '打开片段分析', exact: true })).toHaveCount(0)
  await expect(page.locator('.ink')).toHaveAttribute('data-layer-count', '2')
  await expect(page.getByRole('status').filter({ hasText: '已保存到本机' })).toBeVisible()
  await page.reload()
  await expect(page.locator('.ink')).toHaveAttribute('data-layer-count', '2')
})

test('word collection follows a manually corrected sentence boundary', async ({ page }) => {
  const source = 'The puma escaped. It ran away.'
  await fresh(page, source)
  await page.getByRole('button', { name: '第 2 句分句选项' }).click()
  await page.getByRole('menuitem', { name: '与上一句合并' }).click()
  await select(page, 'ran')
  await page.getByRole('button', { name: '查词并加入单词本' }).click()
  await expect(page.getByRole('dialog', { name: 'ran' }).locator('.dictionary-source')).toHaveText(`文章中的原句${source}`)
})
