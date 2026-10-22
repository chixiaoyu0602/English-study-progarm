import { Mark, type Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { closeHistory } from '@tiptap/pm/history'
import { inkLayers, isColor, MAX_INK_LAYERS } from '../shared/schema.js'
import { inkBackground } from '../shared/ink-colors.js'
import { readInk, analysisRange, type AnalysisTarget, type InkLayer } from './ink-ranges'

export { analysisAt, analysisRange } from './ink-ranges'

const inkKey = new PluginKey<DecorationSet>('primary-ink')
function decorations(doc: Editor['state']['doc']) {
  return DecorationSet.create(doc, readInk(doc).map(run => {
    const root = run.layers[0]
    const wide = root.width === 'wide' ? { ...root, depth: 0 } : undefined
    const fine = root.width === 'fine' ? [root] : []
    return Decoration.inline(run.from, run.to, {
      class: 'ink-surface', 'data-analysis-id': root.id, 'data-visible-color': root.color,
      ...(run.from === run.range.from ? { role: 'button', tabindex: '0', 'aria-label': '打开片段分析' } : {}),
      title: '点击打开片段分析',
      style: `--ink-light:${inkBackground(wide, fine, 'light')};--ink-dark:${inkBackground(wide, fine, 'dark')}`,
    })
  }))
}

function applyLayers(tr: Editor['state']['tr'], editor: Editor, from: number, to: number, layers: InkLayer[]) {
  const markType = editor.schema.marks.ink
  tr.removeMark(from, to, markType)
  const top = layers.at(-1)
  if (top) tr.addMark(from, to, markType.create({ color: top.color, width: top.width, layers }))
}

export function paintSelection(editor: Editor, tool: 'wide' | 'fine' | 'erase', color: string) {
  const { from, to, empty } = editor.state.selection
  if (empty || !isColor(color)) return true
  const runs = readInk(editor.state.doc)
  const covered = runs.filter(run => run.from < to && run.to > from)
  let textFrom: number | undefined, textTo = 0
  editor.state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.isText) { textFrom ??= Math.max(from, pos); textTo = Math.min(to, pos + node.nodeSize) }
  })
  const range = covered[0]?.range
  const sameBlock = range?.from === textFrom && range?.to === textTo && covered.every(run => run.range === range)
  const sharedWithAnotherBlock = range && runs.some(run => run.range.id === range.id && run.range !== range)
  const id = sameBlock && !sharedWithAnotherBlock ? range!.id : crypto.randomUUID()
  const tr = closeHistory(editor.state.tr)
  editor.state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText) return
    const old: InkLayer[] = inkLayers(node.marks.find(mark => mark.type.name === 'ink')?.attrs)
    const layers: InkLayer[] = tool === 'erase' ? [] : [{ color, width: tool, id }, ...(sameBlock ? old.slice(1).map(layer => ({ ...layer, parent: id })) : [])]
    applyLayers(tr, editor, Math.max(from, pos), Math.min(to, pos + node.nodeSize), layers)
  })
  editor.view.dispatch(tr)
  editor.chain().focus().setTextSelection(to).unsetMark('ink').run()
  return true
}

export function paintAnalysis(editor: Editor, target: AnalysisTarget, from: number, to: number, tool: 'wide' | 'fine' | 'erase', color: string) {
  const range = analysisRange(editor.state.doc, target)
  if (!range || from >= to || from < range.from || to > range.to || !isColor(color)) return false
  const tr = closeHistory(editor.state.tr)
  let valid = true
  const id = crypto.randomUUID()
  editor.state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText) return
    const old: InkLayer[] = inkLayers(node.marks.find(mark => mark.type.name === 'ink')?.attrs)
    if (old[0]?.id !== target.id) { valid = false; return }
    let layers = [...old]
    if (tool === 'erase') { if (layers.length > 1) layers.pop() }
    else {
      // Recolouring within this view replaces that pen's existing mark; it
      // never creates another navigable level, even for the same colour.
      layers = [old[0], ...old.slice(1).filter(layer => layer.width !== tool), { color, width: tool, id, parent: target.id }]
    }
    if (layers.length > MAX_INK_LAYERS) { valid = false; return }
    applyLayers(tr, editor, Math.max(from, pos), Math.min(to, pos + node.nodeSize), layers)
  })
  if (!valid) return false
  editor.view.dispatch(tr)
  return true
}

export const Ink = Mark.create({
  name: 'ink', inclusive: false,
  addAttributes() {
    return {
      color: { default: '#f3cf62', parseHTML: element => isColor(element.dataset.color) ? element.dataset.color : '#f3cf62' },
      width: { default: 'wide', parseHTML: element => element.dataset.width === 'fine' ? 'fine' : 'wide' },
      layers: { default: null, parseHTML: element => { try { return JSON.parse(element.dataset.layers || 'null') } catch { return null } } },
    }
  },
  addProseMirrorPlugins() {
    return [new Plugin({
      key: inkKey,
      state: { init: (_, state) => decorations(state.doc), apply: (tr, previous) => tr.docChanged ? decorations(tr.doc) : previous },
      props: { decorations: state => inkKey.getState(state) },
    })]
  },
  parseHTML() { return [{ tag: 'span[data-ink]' }] },
  renderHTML({ HTMLAttributes }) {
    const layers = inkLayers(HTMLAttributes)
    const primary = layers[0] || { color: '#f3cf62', width: 'wide' }
    return ['span', { 'data-ink': '', 'data-color': primary.color, 'data-width': primary.width,
      'data-layers': JSON.stringify(layers), 'data-layer-count': layers.length,
      class: `ink ink-${primary.width}` }, 0]
  },
})
