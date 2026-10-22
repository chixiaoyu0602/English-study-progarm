import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeWord } from '../shared/dictionary.js'
import { normalizeIPA } from '../shared/pronunciation.js'

const script = fileURLToPath(new URL('./speech.ps1', import.meta.url))
let active = null
export function stopSpeech() { active?.cancel(); active = null }

export async function speakWord(request, { probe = false } = {}) {
  if (!request || typeof request.word !== 'string' || !normalizeWord(request.word) || request.word.length > 80 || typeof request.phonetic !== 'string' || request.phonetic.length > 200) return { ok: false, error: '请选择一个有效的英文单词。' }
  if (process.platform !== 'win32') return { ok: false, error: '本地音标发音适用于 Windows 桌面版。' }
  stopSpeech()
  return await new Promise(resolve => {
    // Electron's ASAR is not a real directory for PowerShell. asarUnpack keeps
    // the trusted, bundled script accessible without downloading executables.
    const scriptPath = script.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1')
    const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    const child = spawn(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    let output = '', finished = false
    const finish = result => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      if (active?.child === child) active = null
      resolve(result)
    }
    const cancel = () => { child.kill(); finish({ ok: false, canceled: true }) }
    const timer = setTimeout(() => { child.kill(); finish({ ok: false, error: '发音超时，请检查本地英语语音是否可用。' }) }, 20000)
    active = { child, cancel }
    child.on('error', () => finish({ ok: false, error: '无法启动 Windows 本地语音，请检查系统语音组件。' }))
    child.stdin.on('error', () => {})
    child.stderr.resume()
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', chunk => {
      output += chunk
      if (output.length > 65536) { child.kill(); finish({ ok: false, error: '本地语音返回异常。' }) }
    })
    child.on('close', () => {
      try {
        const result = JSON.parse(output.replace(/^\uFEFF/, '').trim())
        if (result.code === 'no-voice') result.error = '缺少本地英语语音。请在 Windows「设置 → 时间和语言 → 语音」中添加英语语音包；安装后可离线发音。'
        else if (!result.ok) result.error = '本地发音失败，请检查英语语音包和声音输出设备。'
        finish(result)
      } catch { finish({ ok: false, error: '本地语音暂不可用，请检查 Windows 英语语音组件。' }) }
    })
    child.stdin.end(JSON.stringify({ word: normalizeWord(request.word), ipa: normalizeIPA(request.phonetic), action: probe ? 'probe' : 'speak' }))
  })
}
