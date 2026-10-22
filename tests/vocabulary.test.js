import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeNotebooks, parseNotebook, validateNotebook, EMPTY_DOC } from '../shared/schema.js'

const book = () => ({ version: 4, notes: [{ id: 'article', title: 'Reading', content: structuredClone(EMPTY_DOC), createdAt: 1, updatedAt: 1 }], activeId: 'article', vocabulary: [], theme: 'light', color: '#f3cf62', pen: 'wide', customColors: [], fontSize: 20 })
const card = () => ({ word: 'puma', phonetic: 'pju:mə', meaning: 'n. 美洲狮', addedAt: 1, source: { noteId: 'article', title: 'Reading', quote: 'The hunt for the puma began.', selected: 'puma' } })
test('round-trips vocabulary, dictionary meanings and source snapshots', () => {
  const data = { ...book(), vocabulary: [card()] }
  assert.deepEqual(parseNotebook(JSON.stringify(data)), data)
})
test('upgrades both old formats and preserves notes without inventing word cards', () => {
  for (const version of [1, 2]) {
    const legacy = { ...book(), version }; delete legacy.vocabulary
    const upgraded = parseNotebook(JSON.stringify(legacy))
    assert.equal(upgraded.version, 4)
    assert.deepEqual(upgraded.vocabulary, [])
    assert.deepEqual(upgraded.notes, legacy.notes)
    assert.equal(legacy.version, version)
  }
})
test('rejects duplicate words, invalid meanings, malformed sources and excessive counts', () => {
  for (const changes of [{ word: 'PUMA' }, { word: '__proto__' }, { meaning: '' }, { meaning: 'x'.repeat(8501) }, { phonetic: null }, { addedAt: 1e30 }, { source: {} }, { source: { ...card().source, noteId: 12 } }]) {
    assert.throws(() => validateNotebook({ ...book(), vocabulary: [{ ...card(), ...changes }] }))
  }
  assert.throws(() => validateNotebook({ ...book(), vocabulary: [card(), card()] }))
  assert.throws(() => validateNotebook({ ...book(), vocabulary: Array(5001).fill(card()) }))
  assert.throws(() => validateNotebook({ ...book(), vocabulary: null }))
})
test('imports vocabulary without duplication and remaps its article references', () => {
  const current = { ...book(), vocabulary: [{ ...card(), word: 'hunt', meaning: '追捕' }] }
  const incoming = { ...book(), vocabulary: [card()] }
  const merged = mergeNotebooks(current, incoming, () => 'imported-article')
  assert.equal(merged.importedNotes, 1)
  assert.equal(merged.importedWords, 1)
  assert.equal(merged.book.vocabulary[0].source.noteId, 'imported-article')
  assert.equal(merged.book.vocabulary[0].source.quote, card().source.quote)
  assert.equal(incoming.vocabulary[0].source.noteId, 'article')
  const repeated = mergeNotebooks(merged.book, incoming, () => 'imported-again')
  assert.equal(repeated.importedWords, 0)
  assert.equal(repeated.book.vocabulary.length, 2)
  assert.equal(repeated.book.vocabulary[0].source.noteId, 'imported-article')
})
test('retains original sentences after article deletion and supports word-only backups', () => {
  const incoming = { ...book(), notes: [], activeId: null, vocabulary: [card()] }
  assert.doesNotThrow(() => validateNotebook(incoming))
  const merged = mergeNotebooks(book(), incoming)
  assert.equal(merged.book.vocabulary[0].source.noteId, null)
  assert.equal(merged.book.vocabulary[0].source.quote, card().source.quote)
  assert.equal(merged.book.activeId, 'article')
})
test('restoring an article repairs an existing word link while preserving its saved definition', () => {
  const current = { ...book(), notes: [], activeId: null, vocabulary: [{ ...card(), meaning: '原先保存的释义' }] }
  const incoming = { ...book(), vocabulary: [card()] }
  const merged = mergeNotebooks(current, incoming, () => 'restored-article')
  assert.equal(merged.importedWords, 0)
  assert.equal(merged.book.vocabulary[0].meaning, '原先保存的释义')
  assert.equal(merged.book.vocabulary[0].source.noteId, 'restored-article')
  assert.equal(merged.book.vocabulary[0].source.quote, card().source.quote)
})
