const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' })
const abbreviation = /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|e\.g|i\.e)\.$/i

// Offsets are UTF-16, matching both ProseMirror and browser selections.
export function englishWords(text) {
  return text.match(/[a-z]+(?:['’\-][a-z]+)*/gi) || []
}

export function sentenceSegments(text) {
  const result = []
  for (const part of segmenter.segment(text)) {
    const previous = result.at(-1)
    // ICU can split "Mr. Smith" and initials. Keep those names together.
    if (previous && (abbreviation.test(previous.text.trimEnd()) || /(?:^|\s)[A-Z]\.$/.test(previous.text.trimEnd()))) {
      previous.text += part.segment
      previous.to = part.index + part.segment.length
    } else result.push({ from: part.index, to: part.index + part.segment.length, text: part.segment })
  }
  return result.filter(part => part.text.trim())
}

/** @returns {{split: number[], join: number[]}} */
export const emptySentenceBreaks = () => ({ split: [], join: [] })

export function sentenceRanges(doc, overrides = emptySentenceBreaks()) {
  const result = []
  doc.descendants((node, pos) => {
    if (node.type.name !== 'paragraph') return
    const text = node.textBetween(0, node.content.size, '\n', '\n')
    if (!text.trim()) return false
    const start = pos + 1, end = start + node.content.size
    const automatic = sentenceSegments(text).map(segment => start + segment.from)
    const cuts = [...new Set([start, ...automatic.filter(at => !overrides.join.includes(at)), ...overrides.split.filter(at => at > start && at < end)])].sort((a, b) => a - b)
    for (let i = 0; i < cuts.length; i++) {
      const from = cuts[i], to = cuts[i + 1] ?? end
      if (doc.textBetween(from, to).trim()) result.push({ from, to, paragraph: start, first: i === 0 })
    }
    return false
  })
  return result
}
