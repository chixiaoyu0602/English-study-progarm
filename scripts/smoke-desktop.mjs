import { _electron as electron, expect } from '@playwright/test'
import { openAnalysis, panel, paintDetail } from '../tests/helpers.ts'
import { mkdtemp, readFile, writeFile, readdir, rm, appendFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = await mkdtemp(path.join(tmpdir(), 'marknote-smoke-'))
const notebookPath = path.join(dataDir, 'notebook.json')
const backupPath = path.join(dataDir, 'export.marknote')
const headless = process.platform === 'linux' ? ['--no-sandbox', '--disable-dev-shm-usage', '--ozone-platform=headless'] : []
const executablePath = process.env.MARKNOTE_EXECUTABLE
let app
async function launch() {
  app = await electron.launch({
    ...(executablePath ? { executablePath: path.resolve(executablePath), args: headless } : { args: [root, ...headless] }),
    env: { ...process.env, MARKNOTE_USER_DATA_DIR: dataDir },
  })
  const page = await app.firstWindow()
  await page.context().setOffline(true)
  await expect(page.getByRole('textbox', { name: '笔记正文' })).toBeVisible()
  return page
}
try {
  let page = await launch()
  expect(await page.evaluate(() => typeof window.desktop?.save)).toBe('function')
  expect(await page.evaluate(() => typeof window.desktop?.speak)).toBe('function')
  if (process.platform === 'win32') {
    const audio = await app.evaluate(async ({ app }) => {
      // Inspector evaluation has no dynamic-import callback. Node 24 can
      // require this already-loaded ESM module through createRequire instead.
      const { createRequire } = process.getBuiltinModule('module')
      const { join } = process.getBuiltinModule('path')
      const { speakWord } = createRequire(join(app.getAppPath(), 'package.json'))('./electron/speech.js')
      return await speakWord({ word: 'cat', phonetic: 'kæt' }, { probe: true })
    })
    expect(audio.ok, JSON.stringify(audio)).toBe(true)
    expect(audio.mode).toBe('ipa')
    expect(audio.waveHeader).toBe('RIFF')
    expect(audio.audioBytes).toBeGreaterThan(1000)
    console.log(`PASS: packaged offline Windows IPA synthesis, ${audio.audioBytes} audio bytes`)
  }
  await page.getByRole('textbox', { name: '笔记标题' }).fill('桌面保存测试')
  await page.getByRole('textbox', { name: '笔记正文' }).fill('The hunt for the puma. 你好，拾光。')
  await page.getByRole('textbox', { name: '笔记正文' }).press('Control+a')
  await expect(page.locator('.tool-hint')).toContainText('选择一支记号笔')
  await page.getByRole('button', { name: '粗记号笔', exact: true }).click()
  await expect(page.locator('.ink')).toHaveCount(2)
  expect(await page.locator('.ink').evaluateAll(elements => elements.every(element => element.getAttribute('data-layer-count') === '1'))).toBe(true)
  await page.getByRole('button', { name: '切换到夜间模式' }).click()
  await openAnalysis(page)
  await expect(panel(page).locator('[data-detail-ink]')).toHaveCount(0)
  await paintDetail(page, 'The hunt')
  await paintDetail(page, 'puma', '晴空蓝', '细记号笔')
  await expect(panel(page).getByRole('status')).toContainText('内部标记已保存')
  let disk = JSON.parse(await readFile(notebookPath, 'utf8'))
  expect(disk.notes[0].title).toBe('桌面保存测试')
  expect(disk.theme).toBe('dark')
  expect(disk.version).toBe(4)
  const nested = disk.notes[0].content.content[0].content[0].marks[0].attrs.layers
  expect(nested).toHaveLength(2)
  expect(nested[1].parent).toBe(nested[0].id)
  expect(nested[0].color).toBe('#f3cf62')
  expect(nested[1].color).toBe('#f09a91')
  await page.getByRole('button', { name: '关闭片段分析' }).click()
  expect(await page.locator('.tiptap [data-visible-color]').evaluateAll(es => es.every(el => el.dataset.visibleColor === '#f3cf62'))).toBe(true)
  // The packaged dictionary must work with the renderer explicitly offline and CSP enabled.
  await page.getByRole('button', { name: '打开单词本' }).click()
  await page.getByRole('textbox', { name: '搜索单词或中文释义' }).fill('puma')
  await page.getByRole('textbox', { name: '搜索单词或中文释义' }).press('Enter')
  await expect(page.getByRole('dialog', { name: 'puma' })).toContainText('美洲狮')
  await page.getByRole('button', { name: '加入单词本', exact: true }).click()
  await page.getByRole('button', { name: '关闭查词' }).click()
  await expect(page.getByRole('article', { name: '单词 puma' })).toContainText('美洲狮')
  await expect(page.getByRole('status').filter({ hasText: '已保存到本机' })).toBeVisible()
  disk = JSON.parse(await readFile(notebookPath, 'utf8'))
  expect(disk.vocabulary[0].word).toBe('puma')
  expect(disk.vocabulary[0].meaning).toContain('美洲狮')
  await page.locator('.note-card').first().click()
  // Exercise actual native-dialog IPC without requiring a person to click an OS dialog.
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file })
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] })
  }, backupPath)
  await page.getByRole('button', { name: '导出备份' }).click()
  await expect(page.getByRole('status').filter({ hasText: '全部笔记已导出' })).toBeVisible()
  expect(JSON.parse(await readFile(backupPath, 'utf8')).notes[0].title).toBe('桌面保存测试')
  expect(JSON.parse(await readFile(backupPath, 'utf8')).vocabulary[0].meaning).toContain('美洲狮')
  await page.getByRole('button', { name: '导入备份' }).click()
  await expect(page.locator('.note-card')).toHaveCount(2)
  // Close before the 250 ms autosave delay: the close handshake must flush this edit.
  await page.getByRole('textbox', { name: '笔记标题' }).fill('关闭前最后一次编辑')
  await openAnalysis(page)
  await paintDetail(page, 'puma', '草木绿', '细记号笔')
  const closed = app.waitForEvent('close')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
  await closed
  app = undefined
  disk = JSON.parse(await readFile(notebookPath, 'utf8'))
  expect(disk.notes.find(note => note.id === disk.activeId).title).toBe('关闭前最后一次编辑')
  console.log('PASS: native bridge, disk persistence, backup import/export and close flush')
  page = await launch()
  await expect(page.getByRole('textbox', { name: '笔记标题' })).toHaveValue('关闭前最后一次编辑')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await openAnalysis(page)
  await expect(panel(page).locator('[data-color="#f09a91"]')).toHaveText('The hunt')
  await expect(panel(page).locator('[data-color="#a2cf95"]')).toHaveText('puma')
  await page.getByRole('button', { name: '关闭片段分析' }).click()
  await expect(page.locator('.wordbook-count')).toHaveText('1')
  await app.close(); app = undefined
  // Corrupt the primary file while stopped. Recovery must preserve it and use a valid backup.
  await writeFile(notebookPath, 'corrupted-primary-for-test')
  page = await launch()
  await expect(page.getByRole('status').filter({ hasText: '已从上一次备份恢复' })).toBeVisible()
  expect((await readdir(dataDir)).some(file => file.startsWith('notebook.json.corrupt-'))).toBe(true)
  await page.getByRole('textbox', { name: '笔记标题' }).fill('恢复后可继续保存')
  await expect(page.getByRole('status').filter({ hasText: '已保存到本机' })).toBeVisible()
  disk = JSON.parse(await readFile(notebookPath, 'utf8'))
  expect(disk.notes.find(note => note.id === disk.activeId).title).toBe('恢复后可继续保存')
  console.log('PASS: relaunch restores notes and theme; corrupt-file recovery preserves original')
} catch (error) {
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n### Desktop verification failure\n\n\`\`\`text\n${error.stack || error}\n\`\`\`\n`)
  throw error
} finally {
  if (app) await app.close()
  await rm(dataDir, { recursive: true, force: true })
}
