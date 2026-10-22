export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const MAX_NOTES = 500
export const MAX_TEXT = 200000
export const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] }
export const isColor = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)

function validateDoc(doc) {
  if (!doc || doc.type !== 'doc' || !Array.isArray(doc.content)) return false
  let length = 0
  let nodes = 0
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
      if (!node.marks.every(mark => mark.type === 'ink' && isColor(mark.attrs?.color) && ['wide', 'fine'].includes(mark.attrs?.width))) return false
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
  if (!value || value.version !== 1 || !Array.isArray(value.notes) || value.notes.length > MAX_NOTES) throw new Error('不是有效的拾光笔记备份，或笔记数量超过 500 篇。')
  const ids = new Set()
  for (const note of value.notes) {
    if (!note || typeof note.id !== 'string' || !note.id || ids.has(note.id) || note.id.length > 100 ||
      typeof note.title !== 'string' || note.title.length > 200 || !Number.isFinite(note.updatedAt) || !Number.isFinite(note.createdAt) || !validateDoc(note.content)) {
      throw new Error('备份中的笔记格式无效。每篇笔记最多支持 20 万字符。')
    }
    ids.add(note.id)
  }
  if (!['light', 'dark'].includes(value.theme) || !isColor(value.color) || !['wide', 'fine'].includes(value.pen) ||
    !Array.isArray(value.customColors) || value.customColors.length > 8 || !value.customColors.every(isColor) ||
    !Number.isInteger(value.fontSize) || value.fontSize < 16 || value.fontSize > 28 ||
    !(value.activeId === null || ids.has(value.activeId))) throw new Error('备份中的偏好设置无效。')
  return value
}

export function parseNotebook(text) {
  if (new TextEncoder().encode(text).length > MAX_FILE_BYTES) throw new Error('备份不能超过 10 MB。')
  return validateNotebook(JSON.parse(text))
}

export function docText(doc) {
  return (doc.content || []).map(paragraph => (paragraph.content || []).map(node => node.type === 'hardBreak' ? '\n' : node.text || '').join('')).join('\n')
}
