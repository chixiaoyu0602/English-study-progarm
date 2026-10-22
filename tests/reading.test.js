import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Schema } from '@tiptap/pm/model'
import { englishWords, sentenceSegments, sentenceRanges } from '../shared/reading.js'
import { normalizeIPA } from '../shared/pronunciation.js'
import { canAnalyze, readInk } from '../src/ink-ranges.ts'
import { validateNotebook } from '../shared/schema.js'

test('sentence segmentation keeps names, initials, decimals and quotation endings together', () => {
  const cases = [
    ['Mr. Smith paid $3.50. He left.', ['Mr. Smith paid $3.50. ', 'He left.']],
    ['Dr. J. Smith lives in the U.S. He reads.', ['Dr. J. Smith lives in the U.S. ', 'He reads.']],
    ['She said, "Run!" Then she left.', ['She said, "Run!" ', 'Then she left.']],
    ['One clause, then another; both belong here. Next sentence.', ['One clause, then another; both belong here. ', 'Next sentence.']],
  ]
  for (const [input, expected] of cases) assert.deepEqual(sentenceSegments(input).map(part => part.text), expected)
})

test('single-word eligibility treats apostrophes and hyphens as part of one word, regardless of internal ink runs', () => {
  assert.equal(englishWords("'don't'").length, 1)
  assert.equal(englishWords('well-known.').length, 1)
  const schema = new Schema({ nodes: { doc: { content: 'paragraph+' }, paragraph: { content: 'text*' }, text: {} }, marks: { ink: { attrs: { layers: {} } } } })
  const root = { id: 'r', color: '#f3cf62', width: 'wide' }
  const marked = (value, layers) => schema.text(value, [schema.marks.ink.create({ layers })])
  const doc = schema.node('doc', null, [schema.node('paragraph', null, [marked('s', [root]), marked('aw', [root, { ...root, id: 'd', parent: 'r' }])])])
  assert.equal(canAnalyze(doc, readInk(doc)[0].range), false)
  const phrase = schema.node('doc', null, [schema.node('paragraph', null, [marked('a large cat', [root])])])
  assert.equal(canAnalyze(phrase, readInk(phrase)[0].range), true)
})

test('manual sentence boundaries use document positions and never mutate the article', () => {
  const schema = new Schema({ nodes: { doc: { content: 'paragraph+' }, paragraph: { content: 'text*' }, text: {} } })
  const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('One sentence. Another sentence.')])])
  const before = doc.toJSON()
  assert.equal(sentenceRanges(doc).length, 2)
  assert.equal(sentenceRanges(doc, { split: [], join: [15] }).length, 1)
  assert.equal(sentenceRanges(doc, { split: [5], join: [15] }).length, 2)
  assert.deepEqual(doc.toJSON(), before)
})

test('IPA normalizes old dictionary typography and rejects ambiguous or unsupported data', () => {
  assert.equal(normalizeIPA("'pju:mә"), 'ˈpjuːmə')
  assert.equal(normalizeIPA('/ˈkæt/'), 'ˈkæt')
  assert.equal(normalizeIPA('[ri:d]'), 'riːd')
  for (const value of ['', null, 'ri:d, red', 'ri:d / red', '<phoneme>', '中文']) assert.equal(normalizeIPA(value), null)
})

test('backups validate reading mode and sentence positions while retaining old format-4 compatibility', () => {
  const book = { version: 4, notes: [{ id: 'n', title: '', createdAt: 1, updatedAt: 1, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'One. Two.' }] }] } }], activeId: 'n', vocabulary: [], theme: 'light', color: '#f3cf62', pen: 'wide', customColors: [], fontSize: 20 }
  assert.equal(validateNotebook(book).version, 4)
  assert.equal(validateNotebook({ ...book, readingMode: 'sentences' }).readingMode, 'sentences')
  assert.throws(() => validateNotebook({ ...book, readingMode: 'bad' }))
  for (const positions of [[-1], [9999], [1.5], ['3']]) assert.throws(() => validateNotebook({ ...book, notes: [{ ...book.notes[0], sentenceBreaks: { split: positions, join: [] } }] }))
})
