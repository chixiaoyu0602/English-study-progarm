import { Mark, type Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { inkLayers, isColor, MAX_INK_LAYERS } from '../shared/schema.js'
import { inkBackground } from '../shared/ink-colors.js'
import { readInk, topLayerIndex, visibleWide, type InkRun } from './ink-ranges'

const inkKey = new PluginKey<{ runs: InkRun[]; decorations: DecorationSet }>('ink-ranges')

function decorations(doc: Editor['state']['doc']) {
  const runs = readInk(doc)
  const marks = runs.map(run => {
    const wide = visibleWide(run)
    const fine = run.layers.filter(layer => layer.width === 'fine')
    const start = wide && wide.depth > 0 && run.from === wide.from
    const end = wide && wide.depth > 0 && run.to === wide.to
    return Decoration.inline(run.from, run.to, {
      class: `ink-surface${start ? ' ink-start' : ''}${end ? ' ink-end' : ''}`,
      'data-depth': String(wide ? wide.depth + 1 : 0),
      'data-visible-color': wide?.color || '',
      title: `${wide ? `第 ${wide.depth + 1} 级底色 · ` : ''}${run.layers.length} 层标注；橡皮擦除最上层`,
      style: `--ink-light:${inkBackground(wide, fine, 'light')};--ink-dark:${inkBackground(wide, fine, 'dark')};--ink-edge:${wide?.color || 'transparent'}`,
    })
  })
  return { runs, decorations: DecorationSet.create(doc, marks) }
}

export function paintSelection(editor: Editor, tool: 'wide' | 'fine' | 'erase', color: string) {
  const { from, to, empty } = editor.state.selection
  if (empty || !isColor(color)) return true
  const runs = inkKey.getState(editor.state)?.runs || readInk(editor.state.doc)
  const covered = runs.filter(run => run.from < to && run.to > from)
  const last = covered[0]?.ranges.at(-1)
  let textFrom: number | undefined, textTo = 0
  editor.state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.isText) { textFrom ??= Math.max(from, pos); textTo = Math.min(to, pos + node.nodeSize) }
  })
  // A smaller range of the same colour is a new grammatical component.
  const duplicate = tool !== 'erase' && !!last && last.from === textFrom && last.to === textTo &&
    last.color.toLowerCase() === color.toLowerCase() && last.width === tool &&
    covered.every(run => run.layers.at(-1)?.id === last.id)
  if (!duplicate && tool !== 'erase' && covered.some(run => run.layers.length >= MAX_INK_LAYERS)) return false
  const byPosition = new Map(covered.map(run => [run.from, run]))

  return editor.chain().focus().command(({ tr }) => {
    const markType = editor.schema.marks.ink
    // Migrate anonymous old strokes in this same undoable transaction.
    for (const run of runs) {
      if (run.anonymous) {
        tr.addMark(run.from, run.to, markType.create({ ...run.layers.at(-1), layers: run.layers }))
      }
    }
    if (!duplicate) {
      const id = crypto.randomUUID()
      editor.state.doc.nodesBetween(from, to, (node, pos) => {
        if (!node.isText) return
        const run = byPosition.get(pos)
        const layers = [...(run?.layers || [])]
        if (tool === 'erase') { if (run) layers.splice(topLayerIndex(run), 1) }
        else layers.push({ color, width: tool, id })
        const start = Math.max(from, pos), end = Math.min(to, pos + node.nodeSize)
        tr.removeMark(start, end, markType)
        if (layers.length) tr.addMark(start, end, markType.create({ ...layers.at(-1), layers }))
      })
    }
    return true
  }).setTextSelection(to).unsetMark('ink').run()
}

export const Ink = Mark.create({
  name: 'ink',
  inclusive: false,
  addAttributes() {
    return {
      color: { default: '#f3cf62', parseHTML: element => isColor(element.dataset.color) ? element.dataset.color : '#f3cf62' },
      width: { default: 'wide', parseHTML: element => element.dataset.width === 'fine' ? 'fine' : 'wide' },
      layers: { default: null, parseHTML: element => {
        try { return JSON.parse(element.dataset.layers || 'null') } catch { return null }
      } },
    }
  },
  addProseMirrorPlugins() {
    return [new Plugin({
      key: inkKey,
      state: {
        init: (_, state) => decorations(state.doc),
        apply: (tr, previous) => tr.docChanged ? decorations(tr.doc) : previous,
      },
      props: { decorations: state => inkKey.getState(state)?.decorations },
    })]
  },
  parseHTML() { return [{ tag: 'span[data-ink]' }] },
  renderHTML({ HTMLAttributes }) {
    const layers = inkLayers(HTMLAttributes)
    const top = layers.at(-1) || { color: '#f3cf62', width: 'wide' }
    return ['span', {
      'data-ink': '', 'data-color': top.color, 'data-width': top.width,
      'data-layers': JSON.stringify(layers), 'data-layer-count': layers.length,
      class: `ink ink-${top.width}${layers.length > 1 ? ' ink-layered' : ''}`,
    }, 0]
  },
})
