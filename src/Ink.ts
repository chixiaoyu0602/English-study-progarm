import { Mark, type Editor } from '@tiptap/core'
import { inkLayers, isColor, MAX_INK_LAYERS } from '../shared/schema.js'

export interface InkLayer { color: string; width: 'wide' | 'fine' }

function backgrounds(layers: InkLayer[]) {
  const wide = layers.filter(layer => layer.width === 'wide')
  const fine = layers.filter(layer => layer.width === 'fine')
  const gradients: string[] = []
  for (let i = 0; i < fine.length; i++) {
    const bottom = 1 + (fine.length - i - 1) * 4
    const color = `color-mix(in srgb, ${fine[i].color} 95%, var(--paper))`
    gradients.push(`linear-gradient(transparent calc(100% - ${bottom + 3}px), ${color} calc(100% - ${bottom + 3}px), ${color} calc(100% - ${bottom}px), transparent calc(100% - ${bottom}px))`)
  }
  // Opaque color mixing keeps red red. Inset broad strokes expose older colors.
  for (let i = wide.length - 1; i >= 0; i--) {
    const inset = i * Math.min(12, 38 / Math.max(1, wide.length - 1))
    const color = `color-mix(in srgb, ${wide[i].color} var(--ink-strength), var(--paper))`
    gradients.push(`linear-gradient(transparent ${inset}%, ${color} ${inset}%, ${color} ${100 - inset}%, transparent ${100 - inset}%)`)
  }
  return gradients.join(', ')
}

export function paintSelection(editor: Editor, tool: 'wide' | 'fine' | 'erase', color: string) {
  const { from, to, empty } = editor.state.selection
  if (empty || !isColor(color)) return true
  const ranges: { from: number; to: number; layers: InkLayer[] }[] = []
  let limit = false
  editor.state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText) return
    const oldMark = node.marks.find(mark => mark.type.name === 'ink')
    const layers: InkLayer[] = [...inkLayers(oldMark?.attrs)]
    if (tool === 'erase') layers.pop()
    else {
      const last = layers.at(-1)
      if (last?.color !== color || last.width !== tool) {
        if (layers.length >= MAX_INK_LAYERS) limit = true
        else layers.push({ color, width: tool })
      }
    }
    ranges.push({ from: Math.max(from, pos), to: Math.min(to, pos + node.nodeSize), layers })
  })
  if (limit) return false
  return editor.chain().focus().command(({ tr }) => {
    const markType = editor.schema.marks.ink
    for (const range of ranges) {
      tr.removeMark(range.from, range.to, markType)
      const top = range.layers.at(-1)
      if (top) tr.addMark(range.from, range.to, markType.create({ ...top, layers: range.layers }))
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
  parseHTML() { return [{ tag: 'span[data-ink]' }] },
  renderHTML({ HTMLAttributes }) {
    const layers: InkLayer[] = inkLayers(HTMLAttributes)
    const top = layers.at(-1) || { color: '#f3cf62', width: 'wide' }
    const background = backgrounds(layers)
    return ['span', {
      'data-ink': '', 'data-color': top.color, 'data-width': top.width,
      'data-layers': JSON.stringify(layers), 'data-layer-count': layers.length,
      class: `ink ink-${top.width}${layers.length > 1 ? ' ink-layered' : ''}${layers.filter(layer => layer.width === 'wide').length > 1 ? ' ink-framed' : ''}`,
      title: `${layers.length} 层标注（底层 → 顶层）：${layers.map(layer => `${layer.color} ${layer.width === 'wide' ? '粗笔' : '细笔'}`).join(' → ')}`,
      style: `--ink-background:${background};--base-ink:${layers.find(layer => layer.width === 'wide')?.color || top.color}`,
    }, 0]
  },
})
