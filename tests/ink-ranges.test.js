import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Schema } from '@tiptap/pm/model'
import { readInk, analysisAt, analysisRange } from '../src/ink-ranges.ts'
import { upgradeAnnotations } from '../shared/annotations.js'

const schema = new Schema({ nodes: { doc: { content: 'paragraph+' }, paragraph: { content: 'text*' }, text: {} }, marks: { ink: { attrs: { color: {}, width: {}, layers: {} } } } })
const root = { id: 'clause', color: '#f3cf62', width: 'wide' }
const detail = { id: 'word', color: '#f09a91', width: 'wide', parent: 'clause' }
const text = (value, layers = []) => schema.text(value, layers.length ? [schema.marks.ink.create({ color: layers.at(-1).color, width: layers.at(-1).width, layers })] : [])
const doc = (...children) => schema.node('doc', null, [schema.node('paragraph', null, children)])

test('detail marks never split the primary phrase selected for opening', () => {
  const article = doc(text('where ', [root]), text('a woman', [root, detail]), text(' saw', [root]))
  const runs = readInk(article)
  assert.equal(new Set(runs.map(run => run.range)).size, 1)
  assert.deepEqual(analysisAt(article, 9), { ...root, from: 1, to: 18 })
  assert.equal(analysisRange(article, { id: 'clause', from: 1 }).to, 18)
})

test('erased gaps are independent clickable blocks and adjacent IDs stay separate', () => {
  const article = doc(text('ab', [root]), text(' gap '), text('cd', [root]), text('ef', [{ ...root, id: 'next' }]))
  const runs = readInk(article)
  assert.notEqual(runs[0].range, runs[1].range)
  assert.equal(analysisRange(article, { id: 'clause', from: 8 }).from, 8)
  assert.equal(analysisAt(article, 10, 'next').id, 'next')
  assert.equal(analysisRange(article, { id: 'missing', from: 1 }), null)
})

test('legacy containing colour becomes primary even when painted last; every older colour survives inside', () => {
  const oldRoot = { ...root }; delete oldRoot.parent
  const oldDetail = { ...detail }; delete oldDetail.parent
  const article = doc(text('where ', [oldRoot]), text('saw', [oldDetail, oldRoot]), text(' her', [oldRoot])).toJSON()
  const before = JSON.stringify(article), migrated = upgradeAnnotations(article)
  const layers = migrated.content[0].content[1].marks[0].attrs.layers
  assert.deepEqual(layers, [root, detail])
  assert.equal(JSON.stringify(article), before)
})
