import { normalizeWord } from './dictionary.js'
import { upgradeAnnotations } from './annotations.js'

export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const MAX_NOTES = 500
export const MAX_TEXT = 200000
export const MAX_INK_LAYERS = 8
export const MAX_VOCABULARY = 5000
export const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] }
export const isColor = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
const isStrokeId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value)
export const isInkLayer = layer => !!layer && isColor(layer.color) && ['wide', 'fine'].includes(layer.width) &&
  (layer.id === undefined || isStrokeId(layer.id)) && (layer.parent === undefined || isStrokeId(layer.parent))
export function inkLayers(attrs) {
  if (Array.isArray(attrs?.layers) && attrs.layers.length) return attrs.layers
  return isInkLayer(attrs) ? [{ color: attrs.color, width: attrs.width }] : []
}

function validInkMark(mark, version) {
  if (mark?.type !== 'ink' || !isInkLayer(mark.attrs)) return false
  const layers = mark.attrs.layers
  if (layers === undefined || layers === null) return version < 4
  if (!Array.isArray(layers) || !layers.length || layers.length > MAX_INK_LAYERS || !layers.every(isInkLayer)) return false
  const ids = layers.filter(layer => layer.id !== undefined).map(layer => layer.id)
  if (new Set(ids).size !== ids.length) return false
  if (version >= 4 && (!layers[0].id || layers[0].parent !== undefined || layers.some((layer, i) => !layer.id || (i > 0 && layer.parent !== layers[0].id)))) return false
  const top = layers[layers.length - 1]
  return top.color === mark.attrs.color && top.width === mark.attrs.width
}

function validateDoc(doc, version) {
  if (!doc || doc.type !== 'doc' || !Array.isArray(doc.content)) return false
  let length = 0
  let nodes = 0
  const strokes = new Map()
  const walk = (node, depth = 0) => {
    if (!node || ++nodes > 100000 || depth > 3) return false
    if (!['doc', 'paragraph', 'text', 'hardBreak'].includes(node.type)) return false
    if (node.type === 'text') {
      if (typeof node.text !== 'string' || !node.text.length) return false
      length += node.text.length
      if (length > MAX_TEXT || node.content) return false
    } else if (node.text !== undefined) return false
    if (node.marks !== undefined) {
      if (node.type !== 'text' || !Array.isArray(node.marks) || node.marks.length > 1) return false
      if (!node.marks.every(mark => validInkMark(mark, version))) return false
      for (const mark of node.marks) {
        for (const layer of inkLayers(mark.attrs)) {
          if (!layer.id) continue
          const signature = `${layer.color.toLowerCase()}:${layer.width}`
          if (strokes.has(layer.id) && strokes.get(layer.id) !== signature) return false
          strokes.set(layer.id, signature)
        }
      }
    }
    if (node.content !== undefined) {
      if (!Array.isArray(node.content)) return false
      const allowed = node.type === 'doc' ? ['paragraph'] : node.type === 'paragraph' ? ['text', 'hardBreak'] : []
      if (!node.content.every(child => allowed.includes(child.type) && walk(child, depth + 1))) return false
    }
    return true
  }
  return walk(doc)
}

export function validateNotebook(value) {
  if (!value || ![1, 2, 3, 4].includes(value.version) || !Array.isArray(value.notes) || value.notes.length > MAX_NOTES) throw new Error('不是有效的拾光笔记备份，或笔记数量超过 500 篇。')
  const ids = new Set()
  for (const note of value.notes) {
    if (!note || typeof note.id !== 'string' || !note.id || ids.has(note.id) || note.id.length > 100 ||
      typeof note.title !== 'string' || note.title.length > 200 || !Number.isFinite(note.updatedAt) || !Number.isFinite(note.createdAt) || !validateDoc(note.content, value.version)) {
      throw new Error('备份中的笔记格式无效。每篇笔记最多支持 20 万字符。')
    }
    ids.add(note.id)
  }
  if (!['light', 'dark'].includes(value.theme) || !isColor(value.color) || !['wide', 'fine'].includes(value.pen) ||
    !Array.isArray(value.customColors) || value.customColors.length > 8 || !value.customColors.every(isColor) ||
    !Number.isInteger(value.fontSize) || value.fontSize < 16 || value.fontSize > 28 ||
    !(value.activeId === null || ids.has(value.activeId))) throw new Error('备份中的偏好设置无效。')
  const vocabulary = value.vocabulary === undefined && value.version < 3 ? [] : value.vocabulary
  if (!Array.isArray(vocabulary) || vocabulary.length > MAX_VOCABULARY) throw new Error('单词本格式无效，或超过 5000 个单词。')
  const words = new Set()
  for (const entry of vocabulary) {
    if (!entry || normalizeWord(entry.word) !== entry.word || !entry.word || words.has(entry.word) ||
      typeof entry.phonetic !== 'string' || entry.phonetic.length > 200 || typeof entry.meaning !== 'string' || !entry.meaning.trim() || entry.meaning.length > 8500 ||
      !Number.isSafeInteger(entry.addedAt) || entry.addedAt < 0 || entry.addedAt > 8640000000000000) throw new Error('单词本中的单词或释义格式无效。')
    const source = entry.source
    if (source !== null && (!source || !(source.noteId === null || (typeof source.noteId === 'string' && source.noteId.length > 0 && source.noteId.length <= 100)) ||
      typeof source.title !== 'string' || source.title.length > 200 || typeof source.quote !== 'string' || source.quote.length > 1200 ||
      typeof source.selected !== 'string' || source.selected.length > 80 || !normalizeWord(source.selected))) throw new Error('单词的原文出处格式无效。')
    words.add(entry.word)
  }
  if (value.version < 4) return validateNotebook({ ...value, version: 4, vocabulary, notes: value.notes.map(note => ({ ...note, content: upgradeAnnotations(note.content) })) })
  return { ...value, version: 4, vocabulary }
}

export function mergeNotebooks(current, incoming, newId = () => crypto.randomUUID()) {
  current = validateNotebook(current)
  incoming = validateNotebook(incoming)
  if (incoming.notes.length + current.notes.length > MAX_NOTES) throw new Error('导入后将超过 500 篇笔记，请先整理现有笔记。')
  const idMap = new Map(incoming.notes.map(note => [note.id, newId()]))
  const notes = incoming.notes.map(note => ({ ...note, id: idMap.get(note.id), updatedAt: Date.now() }))
  const seen = new Set(current.vocabulary.map(entry => entry.word))
  const incomingWords = new Map(incoming.vocabulary.map(entry => [entry.word, entry]))
  const currentNoteIds = new Set(current.notes.map(note => note.id))
  const retained = current.vocabulary.map(entry => {
    const replacement = incomingWords.get(entry.word)?.source
    const hasArticle = entry.source?.noteId && currentNoteIds.has(entry.source.noteId)
    if (!hasArticle && replacement?.noteId && idMap.has(replacement.noteId)) {
      return { ...entry, source: { ...replacement, noteId: idMap.get(replacement.noteId) } }
    }
    return entry
  })
  const added = incoming.vocabulary.filter(entry => !seen.has(entry.word)).map(entry => ({
    ...entry,
    source: entry.source ? { ...entry.source, noteId: idMap.get(entry.source.noteId) || null } : null,
  }))
  if (current.vocabulary.length + added.length > MAX_VOCABULARY) throw new Error('导入后将超过 5000 个单词，请先整理单词本。')
  const book = validateNotebook({ ...current, notes: [...notes, ...current.notes], vocabulary: [...added, ...retained], activeId: notes[0]?.id || current.activeId })
  if (new TextEncoder().encode(JSON.stringify(book, null, 2)).length > MAX_FILE_BYTES) throw new Error('导入后的笔记库超过 10 MB，请先整理现有内容。')
  return { book, importedNotes: notes.length, importedWords: added.length }
}

export function parseNotebook(text) {
  if (new TextEncoder().encode(text).length > MAX_FILE_BYTES) throw new Error('备份不能超过 10 MB。')
  return validateNotebook(JSON.parse(text))
}

export function docText(doc) {
  return (doc.content || []).map(paragraph => (paragraph.content || []).map(node => node.type === 'hardBreak' ? '\n' : node.text || '').join('')).join('\n')
}
