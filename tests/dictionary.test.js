import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { lookupEntry, normalizeWord } from '../shared/dictionary.js'

const cache = new Map()
const load = async letter => {
  if (!cache.has(letter)) cache.set(letter, JSON.parse(await readFile(new URL(`../src/data/dictionary/${letter}.json`, import.meta.url), 'utf8')))
  return cache.get(letter)
}
test('bundled dictionary shards are intact and contain the declared real vocabulary', async () => {
  const metadata = JSON.parse(await readFile(new URL('../src/data/dictionary/metadata.json', import.meta.url)))
  let count = 0
  for (const [file, hash] of Object.entries(metadata.shards)) {
    const data = await readFile(new URL(`../src/data/dictionary/${file}`, import.meta.url))
    assert.equal(createHash('sha256').update(data).digest('hex'), hash)
    count += Object.keys(JSON.parse(data).entries).length
  }
  assert.equal(count, metadata.entries)
  assert.ok(count > 390000)
  assert.match(await readFile(new URL('../public/DICTIONARY-LICENSE.txt', import.meta.url), 'utf8'), /MIT License/)
})
test('normalizes selected punctuation and case while rejecting phrases and invalid input', () => {
  assert.equal(normalizeWord(' “PUMA,” '), 'puma')
  assert.equal(normalizeWord('don’t'), "don't")
  assert.equal(normalizeWord('well-known'), 'well-known')
  for (const invalid of ['', 'two words', '中文', '123cat', '<script>', '__proto__', 'a'.repeat(81)]) assert.equal(normalizeWord(invalid), null)
})
test('looks up Chinese meanings and phonetics from real bundled entries', async () => {
  const puma = await lookupEntry('PUMA,', load)
  assert.equal(puma.word, 'puma')
  assert.ok(puma.phonetic)
  assert.match(puma.meaning, /美洲狮/)
  assert.match((await lookupEntry('blackberries', load)).meaning, /黑莓/)
  assert.match((await lookupEntry('well-known', load)).meaning, /众所周知/)
})
test('adds the lemma meaning for irregular forms without losing their own senses', async () => {
  assert.match((await lookupEntry('ran', load)).meaning, /原形 run：[\s\S]*跑/)
  const saw = await lookupEntry('saw', load)
  assert.match(saw.meaning, /锯/)
  assert.match(saw.meaning, /原形 see：[\s\S]*看见/)
})
test('resolves documented additional word forms and reports unknown words honestly', async () => {
  const shard = await load('a')
  const [form, base] = Object.entries(shard.forms)[0]
  const match = await lookupEntry(form, load)
  assert.equal(match.word, base)
  assert.equal(match.matchedFrom, form)
  assert.equal(await lookupEntry('zzzxqnotaword', load), null)
})
