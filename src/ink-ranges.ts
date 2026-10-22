import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { inkLayers } from '../shared/schema.js'

export interface InkLayer { color: string; width: 'wide' | 'fine'; id?: string }
export interface InkRange extends InkLayer { id: string; from: number; to: number; depth: number }
export interface InkRun {
  from: number; to: number; layers: InkLayer[]; ranges: InkRange[]; anonymous: boolean
}

// Identities on text keep strokes attached to their words through edits and undo.
export function readInk(doc: ProseMirrorNode) {
  const runs: InkRun[] = []
  let previous = new Map<string, InkRange>()
  let legacy = new Map<string, string>()
  doc.descendants((node, from) => {
    if (!node.isText) return
    const attrs = node.marks.find(mark => mark.type.name === 'ink')?.attrs
    const old: InkLayer[] = inkLayers(attrs)
    const active = new Map<string, InkRange>()
    const nextLegacy = new Map<string, string>()
    const layers = old.map((layer, index) => {
      const signature = old.slice(0, index + 1).map(item => `${item.color.toLowerCase()}:${item.width}:${item.id || ''}`).join('/')
      const id = layer.id || legacy.get(signature) || `legacy-${from}-${index}`
      if (!layer.id) nextLegacy.set(signature, id)
      return { ...layer, id }
    })
    const ranges = layers.map(layer => {
      const range = previous.get(layer.id) || { ...layer, from, to: from, depth: 0 }
      range.to = from + node.nodeSize
      active.set(layer.id, range)
      return range
    })
    if (layers.length) runs.push({ from, to: from + node.nodeSize, layers, ranges, anonymous: old.some(layer => !layer.id) })
    previous = active
    legacy = nextLegacy
  })
  // Only compare ranges meeting at the same text run (at most eight layers).
  const ancestors = new Map<InkRange, Set<InkRange>>()
  for (const run of runs) {
    const wide = run.ranges.filter(range => range.width === 'wide')
    for (const inner of wide) {
      const parents = ancestors.get(inner) || new Set<InkRange>()
      for (const outer of wide) {
        if (outer.from <= inner.from && outer.to >= inner.to && (outer.from < inner.from || outer.to > inner.to)) parents.add(outer)
      }
      ancestors.set(inner, parents)
    }
  }
  const bySize = [...ancestors.keys()].sort((a, b) => (b.to - b.from) - (a.to - a.from))
  for (const range of bySize) {
    for (const parent of ancestors.get(range)!) range.depth = Math.max(range.depth, parent.depth + 1)
  }
  return runs
}

export function visibleWide(run: InkRun) {
  let visible: InkRange | undefined
  for (const range of run.ranges) {
    if (range.width === 'wide' && (!visible || range.depth >= visible.depth)) visible = range
  }
  return visible
}

export function topLayerIndex(run: InkRun) {
  for (let i = run.layers.length - 1; i >= 0; i--) if (run.layers[i].width === 'fine') return i
  return run.ranges.indexOf(visibleWide(run)!)
}
