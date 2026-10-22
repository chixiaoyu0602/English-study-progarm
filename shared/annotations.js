// Upgrade historical stacked strokes to one primary range and its detail marks.
// Preserve every old colour in the detail scope rather than discarding old work.
export function primaryBlockCount(doc) {
  let count = 0, previous = null
  for (const paragraph of doc.content || []) {
    for (const node of paragraph.content || []) {
      if (node.type !== 'text') continue
      const id = node.marks?.find(mark => mark.type === 'ink')?.attrs.layers?.[0]?.id || null
      if (id && id !== previous) count++
      previous = id
    }
  }
  return count
}

export function upgradeAnnotations(content) {
  const doc = structuredClone(content)
  const runs = []
  let position = 0, previous = new Map(), legacy = new Map()
  for (const paragraph of doc.content || []) {
    position++
    for (const node of paragraph.content || []) {
      if (node.type !== 'text') { position++; continue }
      const attrs = node.marks?.find(mark => mark.type === 'ink')?.attrs
      const old = attrs?.layers?.length ? attrs.layers : attrs ? [{ color: attrs.color, width: attrs.width }] : []
      const nextLegacy = new Map(), active = new Map()
      const layers = old.map((layer, index) => {
        const signature = old.slice(0, index + 1).map(item => `${item.color.toLowerCase()}:${item.width}:${item.id || ''}`).join('/')
        const id = layer.id || legacy.get(signature) || `legacy-${position}-${index}`
        if (!layer.id) nextLegacy.set(signature, id)
        return { ...layer, id }
      })
      const ranges = layers.map(layer => {
        const range = previous.get(layer.id) || { from: position, to: position }
        range.to = position + node.text.length
        active.set(layer.id, range)
        return range
      })
      if (layers.length) runs.push({ node, layers, ranges })
      previous = active; legacy = nextLegacy
      position += node.text.length
    }
    position++
  }
  for (const { node, layers, ranges } of runs) {
    let primary = -1
    // Broad containing phrases form the article's first level, including when
    // the phrase was painted after its smaller components in v1.2.
    for (const width of ['wide', 'fine']) {
      for (let i = 0; i < layers.length; i++) {
        if (layers[i].width === width && (primary < 0 || ranges[i].to - ranges[i].from > ranges[primary].to - ranges[primary].from)) primary = i
      }
      if (primary >= 0) break
    }
    const root = layers[primary]
    const nested = [root, ...layers.filter((_, i) => i !== primary).map(layer => ({ ...layer, parent: root.id }))]
    const top = nested.at(-1)
    node.marks = [{ type: 'ink', attrs: { color: top.color, width: top.width, layers: nested } }]
  }
  return doc
}
