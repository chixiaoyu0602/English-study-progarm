import { expect, type Page } from '@playwright/test'

export const body = (page: Page) => page.getByRole('textbox', { name: '笔记正文' })
export async function fresh(page: Page, text = 'The hunt for the puma began in a small village.\n这是第二行，用来练习阅读和标注。') {
  await page.goto('/')
  await page.getByRole('button', { name: '新建笔记' }).click()
  await page.getByRole('textbox', { name: '笔记标题' }).fill('English study')
  await body(page).fill(text)
}
export async function select(page: Page, text: string) {
  await expect(panel(page)).toHaveCount(0)
  await body(page).focus()
  await page.evaluate(target => {
    const editor = document.querySelector('.tiptap')!
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT)
    const start = editor.textContent!.indexOf(target)
    if (start < 0) throw new Error(`Text not found: ${target}`)
    const range = document.createRange()
    let offset = 0, started = false
    while (walker.nextNode()) {
      const node = walker.currentNode, length = node.textContent!.length
      if (!started && start < offset + length) { range.setStart(node, start - offset); started = true }
      if (started && start + target.length <= offset + length) {
        range.setEnd(node, start + target.length - offset)
        const selection = window.getSelection()!
        selection.removeAllRanges(); selection.addRange(range)
        return
      }
      offset += length
    }
    throw new Error(`Range not found: ${target}`)
  }, text)
  await expect(page.locator('.tool-hint')).toContainText('选择一支记号笔')
}

export const panel = (page: Page) => page.getByRole('dialog', { name: '片段分析', exact: true })
export async function openAnalysis(page: Page, index = 0) {
  const button = page.getByRole('button', { name: '打开片段分析', exact: true }).nth(index)
  await button.scrollIntoViewIfNeeded()
  const point = await button.evaluate(el => {
    const rect = [...el.getClientRects()].find(rect => rect.width > 0 && rect.height > 0)!
    return { x: rect.left + Math.min(3, rect.width / 2), y: rect.top + rect.height / 2 }
  })
  await page.mouse.click(point.x, point.y)
  await expect(panel(page)).toBeVisible()
}
export async function selectDetail(page: Page, text: string) {
  await panel(page).getByRole('textbox', { name: '片段文字' }).evaluate((root, text) => {
    const start = root.textContent!.indexOf(text), range = document.createRange()
    if (start < 0) throw new Error(`Text not found: ${text}`)
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let offset = 0, begun = false
    while (walker.nextNode()) {
      const node = walker.currentNode, length = node.textContent!.length
      if (!begun && start < offset + length) { range.setStart(node, start - offset); begun = true }
      if (begun && start + text.length <= offset + length) {
        range.setEnd(node, start + text.length - offset)
        const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range); return
      }
      offset += length
    }
    throw new Error('Range not found')
  }, text)
  await expect(panel(page).locator('.analysis-hint')).toContainText('选择颜色或记号笔')
}
export async function paintDetail(page: Page, text: string, color = '珊瑚红', pen = '粗记号笔') {
  await panel(page).getByRole('button', { name: color, exact: true }).click()
  await selectDetail(page, text)
  await panel(page).getByRole('button', { name: pen, exact: true }).click()
}
