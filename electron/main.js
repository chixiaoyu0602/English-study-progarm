import { app, BrowserWindow, dialog, ipcMain, Menu, session } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir, readFile, rename, writeFile, copyFile, stat } from 'node:fs/promises'
import { mkdirSync } from 'node:fs'
import { parseNotebook, validateNotebook, MAX_FILE_BYTES } from '../shared/schema.js'

const dirname = path.dirname(fileURLToPath(import.meta.url))
// Optional override for development/testing; the Windows app normally uses %APPDATA%/marknote.
if (process.env.MARKNOTE_USER_DATA_DIR) {
  const dataPath = path.resolve(process.env.MARKNOTE_USER_DATA_DIR)
  mkdirSync(dataPath, { recursive: true })
  app.setPath('userData', dataPath)
}
let window
let pendingSave = Promise.resolve()
const filePath = () => path.join(app.getPath('userData'), 'notebook.json')
const failure = error => ({ ok: false, error: error instanceof Error ? error.message : '文件操作失败。' })
const serialize = data => {
  const text = JSON.stringify(validateNotebook(data), null, 2)
  if (Buffer.byteLength(text) > MAX_FILE_BYTES) throw new Error('笔记库超过 10 MB，请先导出备份并精简内容。')
  return text
}

async function readNotebook(file) {
  if ((await stat(file)).size > MAX_FILE_BYTES) throw new Error('备份不能超过 10 MB。')
  return parseNotebook(await readFile(file, 'utf8'))
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus() } })
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null)
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => callback({ responseHeaders: {
      ...details.responseHeaders,
      'Content-Security-Policy': ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-src 'none'"],
    } }))
    ipcMain.handle('notebook:load', async () => {
      try { return { ok: true, data: await readNotebook(filePath()) } }
      catch (error) {
        if (error.code === 'ENOENT') return { ok: true, data: null }
        try {
          const data = await readNotebook(`${filePath()}.bak`)
          await copyFile(filePath(), `${filePath()}.corrupt-${Date.now()}`)
          await writeFile(`${filePath()}.tmp`, serialize(data), 'utf8')
          await rename(`${filePath()}.tmp`, filePath())
          return { ok: true, data, warning: '主文件损坏，已从上一次备份恢复。损坏文件已另存，请导出一份新备份。' }
        }
        catch { return failure(new Error('无法读取笔记文件。原文件已保留，请检查磁盘权限或导入备份；本次不会覆盖原文件。')) }
      }
    })
    ipcMain.handle('notebook:save', (_event, data) => {
      pendingSave = pendingSave.catch(() => {}).then(async () => {
        try {
          const text = serialize(data)
          await mkdir(app.getPath('userData'), { recursive: true })
          await writeFile(`${filePath()}.tmp`, text, 'utf8')
          try {
            await readNotebook(filePath())
            await copyFile(filePath(), `${filePath()}.bak`)
          } catch (error) { if (error.code !== 'ENOENT') throw new Error('现有笔记文件无法安全备份，已停止保存。请导出当前笔记并检查磁盘。') }
          await rename(`${filePath()}.tmp`, filePath())
          return { ok: true }
        } catch (error) { return failure(error) }
      })
      return pendingSave
    })
    ipcMain.handle('notebook:export', async (_event, data) => {
      try {
        const text = serialize(data)
        const result = await dialog.showSaveDialog(window, { title: '导出全部笔记', defaultPath: `拾光笔记-${new Date().toISOString().slice(0, 10)}.marknote`, filters: [{ name: '拾光笔记备份', extensions: ['marknote'] }] })
        if (result.canceled) return { ok: true, canceled: true }
        await writeFile(result.filePath, text, 'utf8')
        return { ok: true }
      } catch (error) { return failure(error) }
    })
    ipcMain.handle('notebook:import', async () => {
      try {
        const result = await dialog.showOpenDialog(window, { title: '导入笔记备份', properties: ['openFile'], filters: [{ name: '拾光笔记备份', extensions: ['marknote', 'json'] }] })
        return result.canceled ? { ok: true, canceled: true } : { ok: true, data: await readNotebook(result.filePaths[0]) }
      } catch (error) { return failure(error) }
    })
    window = new BrowserWindow({
      width: 1240, height: 820, minWidth: 860, minHeight: 600,
      title: '拾光笔记 · MarkNote', backgroundColor: '#f8f7f3', autoHideMenuBar: true,
      icon: path.join(dirname, '../build/icon.png'),
      webPreferences: { preload: path.join(dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
    })
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', event => event.preventDefault())
    let quitting = false
    let closing = false
    window.on('close', event => {
      if (quitting) return
      event.preventDefault()
      if (closing) return
      closing = true
      const finish = async (event, saved) => {
        if (event.sender !== window.webContents) return
        ipcMain.removeListener('notebook:flushed', finish)
        clearTimeout(timeout)
        await pendingSave
        if (!saved) {
          const result = await dialog.showMessageBox(window, { type: 'warning', title: '笔记尚未保存', message: '最近的更改尚未成功写入磁盘。请保留窗口并导出备份。', buttons: ['返回笔记', '仍然退出'], defaultId: 0, cancelId: 0 })
          if (result.response !== 1) { closing = false; return }
        }
        quitting = true
        window.close()
      }
      ipcMain.on('notebook:flushed', finish)
      const timeout = setTimeout(async () => {
        ipcMain.removeListener('notebook:flushed', finish)
        const result = await dialog.showMessageBox(window, { type: 'warning', title: '笔记尚未保存', message: '编辑器未响应，最近的更改可能尚未保存。', buttons: ['继续等待', '仍然退出'], defaultId: 0, cancelId: 0 })
        closing = false
        if (result.response === 1) { quitting = true; window.close() }
      }, 10000)
      window.webContents.send('notebook:flush')
    })
    await window.loadFile(path.join(dirname, '../dist/index.html'))
  }).catch(error => { dialog.showErrorBox('启动失败', error.message); app.quit() })
  app.on('window-all-closed', () => app.quit())
}
