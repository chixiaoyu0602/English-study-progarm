import type { JSONContent } from '@tiptap/core'
import { EMPTY_DOC } from '../shared/schema.js'

export interface Note { id: string; title: string; content: JSONContent; createdAt: number; updatedAt: number }
export interface WordSource { noteId: string | null; title: string; quote: string; selected: string }
export interface WordCard { word: string; phonetic: string; meaning: string; addedAt: number; source: WordSource | null }
export interface Notebook {
  version: 4; notes: Note[]; activeId: string | null; vocabulary: WordCard[]; theme: 'light' | 'dark';
  color: string; pen: 'wide' | 'fine'; customColors: string[]; fontSize: number;
}
export type Result = { ok: boolean; data?: Notebook | null; error?: string; warning?: string; canceled?: boolean }
declare global {
  interface Window {
    desktop?: {
      load: () => Promise<Result>;
      save: (data: Notebook) => Promise<Result>;
      export: (data: Notebook) => Promise<Result>;
      import: () => Promise<Result>;
      onFlush: (handler: () => Promise<boolean>) => () => void;
    }
  }
}
export const COLORS = [
  { name: '麦芽黄', value: '#f3cf62' }, { name: '珊瑚红', value: '#f09a91' },
  { name: '草木绿', value: '#a2cf95' }, { name: '晴空蓝', value: '#94c9e9' },
  { name: '丁香紫', value: '#c3a4df' },
]
export function newNote(): Note {
  const now = Date.now()
  return { id: crypto.randomUUID(), title: '', content: structuredClone(EMPTY_DOC), createdAt: now, updatedAt: now }
}
export function initialNotebook(): Notebook {
  const now = Date.now()
  const ink = (text: string, color: string, width: string = 'wide'): JSONContent => ({ type: 'text', text, marks: [{ type: 'ink', attrs: { color, width, layers: [{ color, width, id: crypto.randomUUID() }] } }] })
  const text = (value: string): JSONContent => ({ type: 'text', text: value })
  const p = (...content: JSONContent[]): JSONContent => ({ type: 'paragraph', content })
  const welcome: Note = {
    id: crypto.randomUUID(), title: '让每一次阅读，都留下痕迹', createdAt: now, updatedAt: now,
    content: { type: 'doc', content: [
      p(text('有些句子，值得慢慢读。')),
      p(text('欢迎来到拾光笔记。这里没有复杂的排版，只有一张安静的纸，和几支顺手的记号笔。把喜欢的文章、课堂笔记，或一段想记住的话，粘贴在这里。')),
      p(text('用 '), ink('粗记号笔', '#f3cf62'), text(' 留下重点，用 '), ink('细记号笔', '#a2cf95', 'fine'), text(' 轻轻划过值得留意的词句。选一支笔、一种颜色，再拖选文字，就能开始标注。')),
      p(text('The secret of getting ahead is '), ink('getting started.', '#94c9e9')),
      p(text('阅读的意义，也许就在于：从别人的文字里，找到 '), ink('属于自己的光。', '#c3a4df', 'fine')),
      p(text('试试看，给你喜欢的这句话涂上一点颜色。')),
    ] },
  }
  return { version: 4, notes: [welcome], activeId: welcome.id, vocabulary: [], theme: 'light', color: COLORS[0].value, pen: 'wide', customColors: [], fontSize: 20 }
}
export function downloadBackup(notebook: Notebook) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(notebook, null, 2)], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `拾光笔记-${new Date().toISOString().slice(0, 10)}.marknote`
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
