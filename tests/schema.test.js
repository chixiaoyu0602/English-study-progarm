import { test } from 'node:test'
import assert from 'node:assert/strict'
import { docText, parseNotebook, validateNotebook, EMPTY_DOC } from '../shared/schema.js'

const book = () => ({ version: 1, notes: [{ id: 'test', title: 'Study', content: structuredClone(EMPTY_DOC), createdAt: 1, updatedAt: 1 }], activeId: 'test', theme: 'light', color: '#f3cf62', pen: 'wide', customColors: [], fontSize: 20 })
test('round-trips Unicode, line breaks, both pen widths and custom colors', () => {
  const data = book()
  data.notes[0].content.content[0].content = [
    { type: 'text', text: '中文 hello 👋', marks: [{ type: 'ink', attrs: { color: '#aa22ff', width: 'wide' } }] },
    { type: 'hardBreak' },
    { type: 'text', text: 'world', marks: [{ type: 'ink', attrs: { color: '#12ab34', width: 'fine' } }] },
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
