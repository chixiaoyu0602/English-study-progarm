import { _electron as electron, expect } from '@playwright/test'
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises'
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
  await expect(page.getByRole('textbox', { name: '笔记正文' })).toBeVisible()
  return page
}
try {
  let page = await launch()
  expect(await page.evaluate(() => typeof window.desktop?.save)).toBe('function')
  await page.getByRole('textbox', { name: '笔记标题' }).fill('桌面保存测试')
  await page.getByRole('textbox', { name: '笔记正文' }).fill('The hunt for the puma. 你好，拾光。')
  await page.getByRole('button', { name: '切换到夜间模式' }).click()
  await expect(page.getByRole('status').filter({ hasText: '已保存到本机' })).toBeVisible()
  let disk = JSON.parse(await readFile(notebookPath, 'utf8'))
  expect(disk.notes[0].title).toBe('桌面保存测试')
  expect(disk.theme).toBe('dark')
  // Exercise actual native-dialog IPC without requiring a person to click an OS dialog.
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file })
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] })
  }, backupPath)
  await page.getByRole('button', { name: '导出备份' }).click()
  await expect(page.getByRole('status').filter({ hasText: '全部笔记已导出' })).toBeVisible()
  expect(JSON.parse(await readFile(backupPath, 'utf8')).notes[0].title).toBe('桌面保存测试')
  await page.getByRole('button', { name: '导入备份' }).click()
  await expect(page.locator('.note-card')).toHaveCount(2)
  // Close before the 250 ms autosave delay: the close handshake must flush this edit.
  await page.getByRole('textbox', { name: '笔记标题' }).fill('关闭前最后一次编辑')
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
} finally {
  if (app) await app.close()
  await rm(dataDir, { recursive: true, force: true })
}
