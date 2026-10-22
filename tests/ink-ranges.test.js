import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Schema } from '@tiptap/pm/model'
import { readInk, visibleWide, topLayerIndex } from '../src/ink-ranges.ts'

const schema = new Schema({
  nodes: { doc: { content: 'paragraph+' }, paragraph: { content: 'text*' }, text: {} },
  marks: { ink: { attrs: { color: {}, width: {}, layers: {} } } },
})
const stroke = (id, color = '#f3cf62', width = 'wide') => ({ id, color, width })
const text = (value, layers = []) => schema.text(value, layers.length ? [schema.marks.ink.create({ ...layers.at(-1), layers })] : [])
const doc = (...content) => schema.node('doc', null, [schema.node('paragraph', null, content)])

test('range containment determines display depth while crossings and equal scopes use paint order', () => {
  const a = stroke('a'), b = stroke('b', '#f09a91'), child = stroke('child'), fine = stroke('fine', '#94c9e9', 'fine')
  const runs = readInk(doc(text('abc', [a]), text('de', [a, b]), text('f', [child, a, b, fine]), text('gh', [a, b]), text('ijk', [b])))
  assert.equal(visibleWide(runs[1]).id, 'b') // Crossed strokes, neither contains the other.
  assert.equal(visibleWide(runs[2]).id, 'child') // Child painted before both parents.
  assert.equal(visibleWide(runs[2]).depth, 1) // Crossing parents do not create a false third level.
  assert.equal(topLayerIndex(runs[2]), 3)
  assert.equal(visibleWide(runs[0]).depth, 0)
  const equal = readInk(doc(text('abc', [a, b]), text('d', [child, a, b])))
  assert.equal(visibleWide(equal[1]).id, 'child')
  assert.equal(visibleWide(equal[1]).depth, 1)
})

test('erased gaps split a stroke into actual surviving ranges without joining across unmarked words', () => {
  const base = stroke('base'), inner = stroke('inner')
  const runs = readInk(doc(text('ab', [base, inner]), text(' gap ', [base]), text('cd', [base, inner])))
  assert.notEqual(runs[0].ranges[1], runs[2].ranges[1])
  assert.deepEqual(runs.map(run => [visibleWide(run).from, visibleWide(run).to, visibleWide(run).depth]), [[1, 3, 1], [1, 10, 0], [8, 10, 1]])
})

test('legacy base identities span internal colour changes and paragraphs without mutating saved data', () => {
  const base = { color: '#f3cf62', width: 'wide' }, inner = { color: '#f09a91', width: 'wide' }
  const article = schema.node('doc', null, [schema.node('paragraph', null, [text('first ', [base]), text('inner', [base, inner])]), schema.node('paragraph', null, [text('last', [base])])])
  const before = article.toJSON()
  const runs = readInk(article)
  assert.equal(runs[0].layers[0].id, runs[1].layers[0].id)
  assert.equal(runs[1].layers[0].id, runs[2].layers[0].id)
  assert.equal(visibleWide(runs[1]).depth, 1)
  assert.deepEqual(article.toJSON(), before)
})
