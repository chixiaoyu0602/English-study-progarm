import { test } from 'node:test'
import assert from 'node:assert/strict'
import { docText, parseNotebook, validateNotebook, EMPTY_DOC } from '../shared/schema.js'

const book = () => ({ version: 4, vocabulary: [], notes: [{ id: 'test', title: 'Study', content: structuredClone(EMPTY_DOC), createdAt: 1, updatedAt: 1 }], activeId: 'test', theme: 'light', color: '#f3cf62', pen: 'wide', customColors: [], fontSize: 20 })
test('round-trips Unicode, line breaks, both pen widths and custom colors', () => {
  const data = book()
  data.notes[0].content.content[0].content = [
    { type: 'text', text: '中文 hello 👋', marks: [{ type: 'ink', attrs: { color: '#aa22ff', width: 'wide', layers: [{ color: '#aa22ff', width: 'wide', id: 'one' }] } }] },
    { type: 'hardBreak' },
    { type: 'text', text: 'world', marks: [{ type: 'ink', attrs: { color: '#12ab34', width: 'fine', layers: [{ color: '#12ab34', width: 'fine', id: 'two' }] } }] },
  ]
  assert.deepEqual(parseNotebook(JSON.stringify(data)), data)
  assert.equal(docText(data.notes[0].content), '中文 hello 👋\nworld')
})
test('rejects malformed, duplicate and orphaned note IDs', () => {
  assert.throws(() => parseNotebook('{'))
  const data = book(); data.activeId = 'missing'; assert.throws(() => validateNotebook(data))
  data.activeId = 'test'; data.notes.push(data.notes[0]); assert.throws(() => validateNotebook(data))
})
test('rejects executable nodes, CSS injection, nested structure and arbitrary marks', () => {
  for (const invalid of [
    { type: 'script', text: 'alert(1)' },
    { type: 'text', text: 'x', marks: [{ type: 'ink', attrs: { color: 'red;background:url(x)', width: 'wide' } }] },
    { type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] },
    { type: 'paragraph', content: [{ type: 'paragraph' }] },
  ]) {
    const data = book(); data.notes[0].content.content[0].content = [invalid]
    assert.throws(() => validateNotebook(data))
  }
})
test('enforces text, file, settings and count limits', () => {
  const data = book()
  data.notes[0].content.content[0].content = [{ type: 'text', text: 'x'.repeat(200001) }]
  assert.throws(() => validateNotebook(data))
  assert.throws(() => parseNotebook(' '.repeat(10 * 1024 * 1024 + 1)))
  for (const changes of [{ fontSize: 99 }, { color: 'red' }, { theme: 'unknown' }, { pen: 'brush' }, { customColors: ['oops'] }, { notes: Array(501).fill(data.notes[0]) }]) assert.throws(() => validateNotebook({ ...book(), ...changes }))
})
test('accepts an empty notebook after deleting all notes', () => {
  assert.doesNotThrow(() => validateNotebook({ ...book(), notes: [], activeId: null }))
})
test('upgrades legacy notebooks while preserving text, colours, note IDs and the original input', () => {
  const legacy = { ...book(), version: 1 }
  legacy.notes[0].content.content[0].content = [{ type: 'text', text: 'old highlight', marks: [{ type: 'ink', attrs: { color: '#f3cf62', width: 'wide' } }] }]
  const upgraded = parseNotebook(JSON.stringify(legacy))
  assert.equal(upgraded.version, 4)
  assert.equal(upgraded.notes[0].id, legacy.notes[0].id)
  assert.equal(docText(upgraded.notes[0].content), 'old highlight')
  assert.equal(upgraded.notes[0].content.content[0].content[0].marks[0].attrs.layers[0].color, '#f3cf62')
  assert.equal(legacy.notes[0].content.content[0].content[0].marks[0].attrs.layers, undefined)
  assert.equal(legacy.version, 1)
})
test('round-trips layers and rejects malformed, excessive or mismatched stacks', () => {
  const data = book()
  const layers = [{ color: '#f3cf62', width: 'wide', id: 'outer' }, { color: '#f09a91', width: 'wide', id: 'red', parent: 'outer' }, { color: '#94c9e9', width: 'fine', id: 'fine', parent: 'outer' }]
  const attrs = { ...layers.at(-1), layers }
  data.notes[0].content.content[0].content = [{ type: 'text', text: 'nested', marks: [{ type: 'ink', attrs }] }]
  assert.deepEqual(parseNotebook(JSON.stringify(data)), data)
  for (const invalid of [[], Array(9).fill(layers[0]), [null], [{ color: 'red;url(x)', width: 'wide' }], [layers[0]], 'not-array']) {
    attrs.layers = invalid
    assert.throws(() => validateNotebook(data))
  }
})

test('stroke identities round-trip and reject duplicate, conflicting or invalid identities', () => {
  const data = book()
  const outer = { color: '#f3cf62', width: 'wide', id: 'outer' }
  const inner = { ...outer, id: 'inner', parent: 'outer' }
  const text = (value, layers) => ({ type: 'text', text: value, marks: [{ type: 'ink', attrs: { ...layers.at(-1), layers } }] })
  data.notes[0].content.content[0].content = [text('outer ', [outer]), text('inner', [outer, inner])]
  assert.deepEqual(parseNotebook(JSON.stringify(data)), data)
  for (const id of ['', ' '.repeat(2), 'x'.repeat(81), 'url(x)', 10]) {
    data.notes[0].content.content[0].content = [text('x', [{ ...outer, id }])]
    assert.throws(() => validateNotebook(data))
  }
  data.notes[0].content.content[0].content = [text('x', [outer, outer])]
  assert.throws(() => validateNotebook(data))
  data.notes[0].content.content[0].content = [text('x', [outer]), text('y', [{ ...outer, color: '#f09a91' }])]
  assert.throws(() => validateNotebook(data))
  for (const layer of [{ ...inner, parent: 'missing' }, { ...inner, parent: 'inner' }, { ...inner, parent: undefined }]) {
    data.notes[0].content.content[0].content = [text('x', [outer, layer])]
    assert.throws(() => validateNotebook(data))
  }
})
