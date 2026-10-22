export interface SpeechResult { ok: boolean; canceled?: boolean; mode?: 'ipa' | 'system'; voice?: string; error?: string }
let cancelBrowser: (() => void) | undefined
let browserGeneration = 0
export function stopPronunciation() {
  browserGeneration++
  cancelBrowser?.(); cancelBrowser = undefined
  window.speechSynthesis?.cancel()
  void window.desktop?.stopSpeech()
}

export async function pronounce(word: string, phonetic: string): Promise<SpeechResult> {
  if (window.desktop) return await window.desktop.speak({ word, phonetic })
  const synth = window.speechSynthesis
  if (!synth) return { ok: false, error: '当前浏览器不支持本地发音，请使用 Windows 桌面版。' }
  stopPronunciation()
  const generation = browserGeneration
  let voices = synth.getVoices()
  if (!voices.length) voices = await new Promise(resolve => {
    const ready = () => { clearTimeout(timer); synth.removeEventListener('voiceschanged', ready); resolve(synth.getVoices()) }
    const timer = setTimeout(ready, 1200)
    synth.addEventListener('voiceschanged', ready)
  })
  if (generation !== browserGeneration) return { ok: false, canceled: true }
  // Browser SSML support varies. Only local spelling-based speech is used here.
  const english = voices.filter(voice => voice.localService && /^en[-_]/i.test(voice.lang))
  const voice = english.find(voice => /^en[-_]GB$/i.test(voice.lang)) || english[0]
  if (!voice) return { ok: false, error: '没有可用的本地英语语音。请安装英语语音包，或使用 Windows 桌面版。' }
  return await new Promise(resolve => {
    const utterance = new SpeechSynthesisUtterance(word)
    utterance.voice = voice; utterance.lang = voice.lang; utterance.rate = 0.9
    let finished = false
    const finish = (result: SpeechResult) => {
      if (finished) return
      finished = true; clearTimeout(timer); cancelBrowser = undefined; resolve(result)
    }
    const timer = setTimeout(() => { synth.cancel(); finish({ ok: false, error: '本地发音超时，请检查系统语音。' }) }, 20000)
    cancelBrowser = () => finish({ ok: false, canceled: true })
    utterance.onend = () => finish({ ok: true, mode: 'system', voice: voice.name })
    utterance.onerror = () => finish({ ok: false, error: '本地发音失败，请检查语音包和声音输出设备。' })
    synth.speak(utterance)
  })
}
