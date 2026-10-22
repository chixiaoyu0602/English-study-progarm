import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { inkLayers } from '../shared/schema.js'

export interface InkLayer { color: string; width: 'wide' | 'fine'; id: string; parent?: string }
export interface InkRange { id: string; from: number; to: number; color: string; width: 'wide' | 'fine' }
export interface InkRun { from: number; to: number; layers: InkLayer[]; range: InkRange }
export interface AnalysisTarget { id: string; from: number }

export function readInk(doc: ProseMirrorNode) {
  const runs: InkRun[] = []
  let previous: InkRange | undefined
  doc.descendants((node, from) => {
    if (!node.isText) return
    const layers: InkLayer[] = inkLayers(node.marks.find(mark => mark.type.name === 'ink')?.attrs)
    const root = layers[0]
    if (!root) { previous = undefined; return }
    const range = previous?.id === root.id ? previous : { id: root.id, from, to: from, color: root.color, width: root.width }
    range.to = from + node.nodeSize
    runs.push({ from, to: range.to, layers, range })
    previous = range
  })
  return runs
}

export function analysisRange(doc: ProseMirrorNode, target: AnalysisTarget) {
  const candidates = [...new Set(readInk(doc).filter(run => run.range.id === target.id).map(run => run.range))]
  return candidates.sort((a, b) => Math.abs(a.from - target.from) - Math.abs(b.from - target.from))[0] || null
}

export function analysisAt(doc: ProseMirrorNode, position: number, id?: string) {
  return readInk(doc).find(run => (!id || run.range.id === id) && run.from <= position && run.to >= position)?.range || null
}
