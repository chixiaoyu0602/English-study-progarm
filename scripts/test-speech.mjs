import assert from 'node:assert/strict'
import { speakWord } from '../electron/speech.js'

if (process.platform !== 'win32') {
  console.log('SKIP: native Windows speech requires Windows')
} else {
  for (const request of [{ word: 'puma', phonetic: "'pju:mә" }, { word: 'cat', phonetic: 'kæt' }, { word: 'read', phonetic: '' }]) {
    const result = await speakWord(request, { probe: true })
    assert.equal(result.ok, true, JSON.stringify(result))
    assert.equal(result.waveHeader, 'RIFF')
    assert.ok(result.audioBytes > 1000, 'speech must contain actual audio samples')
    assert.equal(result.mode, request.phonetic ? 'ipa' : 'system', JSON.stringify(result))
    if (request.phonetic) assert.match(result.ssml, /phoneme/)
    console.log(`PASS: Windows offline ${result.mode} synthesis for ${request.word}, ${result.audioBytes} bytes, ${result.culture}`)
  }
}
