import type { Editor } from '@tiptap/core'
import type { Note, WordSource } from './model'
import { normalizeWord } from '../shared/dictionary.js'

export interface WordRequest { query: string; source: WordSource | null }
export function wordFromArticle(editor: Editor, note: Note, position?: number): WordRequest | null {
  const { from, to, empty } = editor.state.selection
  if (position === undefined && empty) return null
  const pos = position ?? from
  const resolved = editor.state.doc.resolve(pos)
  if (resolved.parent.type.name !== 'paragraph') return null
  const paragraph = resolved.parent.textBetween(0, resolved.parent.content.size, '\n', '\n')
  const offset = resolved.parent.textBetween(0, resolved.parentOffset, '\n', '\n').length
  let selected = position === undefined ? editor.state.doc.textBetween(from, to, ' ', ' ') : ''
  if (position !== undefined) {
    const matches = paragraph.matchAll(/[a-z]+(?:['’-][a-z]+)*/gi)
    selected = [...matches].find(match => offset >= match.index && offset <= match.index + match[0].length)?.[0] || ''
  }
  const query = normalizeWord(selected)
  if (!query) return null
  const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' })
  let quote = [...segmenter.segment(paragraph)].find(segment => offset >= segment.index && offset < segment.index + segment.segment.length)?.segment.trim() || paragraph.trim()
  if (quote.length > 1200) {
    const start = Math.max(0, offset - 400)
    quote = `${start ? '…' : ''}${paragraph.slice(start, start + 1196)}…`
  }
  return { query, source: { noteId: note.id, title: note.title.trim() || '未命名笔记', quote, selected: selected.trim().slice(0, 80) } }
}
