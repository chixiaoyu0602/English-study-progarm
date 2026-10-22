import { expect, type Page } from '@playwright/test'

export const body = (page: Page) => page.getByRole('textbox', { name: '笔记正文' })
export async function fresh(page: Page, text = 'The hunt for the puma began in a small village.\n这是第二行，用来练习阅读和标注。') {
  await page.goto('/')
  await page.getByRole('button', { name: '新建笔记' }).click()
  await page.getByRole('textbox', { name: '笔记标题' }).fill('English study')
  await body(page).fill(text)
}
export async function select(page: Page, text: string) {
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
