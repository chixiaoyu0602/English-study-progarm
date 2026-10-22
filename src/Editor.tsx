import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import type { Editor, JSONContent } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Ink, paintSelection, analysisAt } from './Ink'
import { canAnalyze, type AnalysisTarget } from './ink-ranges'
import { toolCursor } from './cursor'
import type { Note, SentenceBreaks } from './model'
import { Sentences, sentenceKey, type SentenceMenu } from './Sentences'
import { emptySentenceBreaks } from '../shared/reading.js'
import { MAX_TEXT } from '../shared/schema.js'
import { wordFromArticle, type WordRequest } from './reading'

export type Tool = 'text' | 'wide' | 'fine' | 'erase'
interface Props {
  note: Note; tool: Tool; color: string; fontSize: number; readingMode: 'original' | 'sentences';
  onChange: (content: JSONContent, sentenceBreaks: SentenceBreaks) => void; onReady: (editor: Editor | null) => void;
  onSelection: (selected: boolean) => void; onLimit: () => void; onLayerLimit: () => void;
  onLookup: (request: WordRequest) => void;
  onOpenAnalysis: (target: AnalysisTarget) => void;
}
export default function NoteEditor(props: Props) {
  const current = useRef(props)
  const pointer = useRef<{ x: number; y: number } | null>(null)
  const [menu, setMenu] = useState<SentenceMenu | null>(null)
  current.current = props
  const editor = useEditor({
    extensions: [StarterKit.configure({
      blockquote: false, bold: false, bulletList: false, code: false, codeBlock: false,
      dropcursor: false, gapcursor: false, heading: false, horizontalRule: false,
      italic: false, link: false, listItem: false, listKeymap: false, orderedList: false,
      strike: false, underline: false, trailingNode: false,
    }), Ink, Sentences.configure({ enabled: props.readingMode === 'sentences', breaks: props.note.sentenceBreaks || emptySentenceBreaks(), onMenu: setMenu })],
    content: props.note.content,
    editorProps: {
      attributes: { 'aria-label': '笔记正文', role: 'textbox', 'aria-multiline': 'true', spellcheck: 'false', 'data-placeholder': '把文字粘贴在这里，让阅读从这一页开始…' },
      handleDOMEvents: {
        copy(view, event) {
          if (view.state.selection.empty || !event.clipboardData) return false
          const { from, to } = view.state.selection
          event.clipboardData.setData('text/plain', view.state.doc.textBetween(from, to, '\n', '\n'))
          event.preventDefault()
          return true
        },
        cut(view, event) {
          if (view.state.selection.empty || !event.clipboardData) return false
          const { from, to } = view.state.selection
          event.clipboardData.setData('text/plain', view.state.doc.textBetween(from, to, '\n', '\n'))
          event.preventDefault()
          view.dispatch(view.state.tr.deleteSelection().scrollIntoView())
          return true
        },
      },
      handlePaste(view, event) {
        event.preventDefault()
        const plain = event.clipboardData?.getData('text/plain') || ''
        const remaining = MAX_TEXT - (view.state.doc.textContent.length - (view.state.selection.to - view.state.selection.from))
        if (plain.length > remaining) { current.current.onLimit(); return true }
        const content = plain.replace(/\r\n?/g, '\n').split('\n').map(line => ({ type: 'paragraph', ...(line ? { content: [{ type: 'text', text: line }] } : {}) }))
        editor?.chain().focus().insertContent(content).unsetMark('ink').run()
        return true
      },
      handleDrop: () => true,
      handleTextInput(view, _from, _to, text) {
        if (view.state.doc.textContent.length + text.length > MAX_TEXT) { current.current.onLimit(); return true }
        return false
      },
    },
    onTransaction: ({ editor, transaction }) => {
      if (transaction.docChanged || transaction.getMeta(sentenceKey)?.breaks) {
        current.current.onChange(editor.getJSON(), sentenceKey.getState(editor.state)!.breaks)
        setMenu(null)
      }
    },
    onSelectionUpdate: ({ editor }) => current.current.onSelection(!editor.state.selection.empty),
  })
  useEffect(() => {
    props.onReady(editor)
    return () => props.onReady(null)
  }, [editor]) // The editor is recreated when the active note changes.
  useEffect(() => {
    if (editor) editor.view.dispatch(editor.state.tr.setMeta(sentenceKey, { enabled: props.readingMode === 'sentences' }).setMeta('addToHistory', false))
    setMenu(null)
  }, [editor, props.readingMode])
  useEffect(() => {
    if (!menu) return
    document.querySelector<HTMLButtonElement>('.sentence-menu button:not(:disabled)')?.focus()
    const close = () => setMenu(null)
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); setMenu(null); editor?.commands.focus() } }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', key, true)
    document.addEventListener('scroll', close, true)
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', key, true); document.removeEventListener('scroll', close, true) }
  }, [menu])
  const correct = (action: 'join' | 'split' | 'reset') => {
    if (!editor || !menu) return
    const previous = sentenceKey.getState(editor.state)!.breaks
    const breaks = action === 'reset' ? emptySentenceBreaks() : action === 'join'
      ? { split: previous.split.filter(pos => pos !== menu.from), join: [...new Set([...previous.join, menu.from])] }
      : { split: [...new Set([...previous.split, menu.caret])], join: previous.join.filter(pos => pos !== menu.caret) }
    editor.view.dispatch(editor.state.tr.setMeta(sentenceKey, { breaks }).setMeta('addToHistory', false))
    setMenu(null)
    editor.commands.focus()
  }

  const apply = () => {
    if (!editor || editor.state.selection.empty || current.current.tool === 'text') return
    if (!paintSelection(editor, current.current.tool, current.current.color)) { current.current.onLayerLimit(); return }
    current.current.onSelection(false)
  }
  return <div className={`editor-body tool-${props.tool} ${props.readingMode === 'sentences' ? 'sentence-view' : ''}`} style={{ '--reading-size': `${props.fontSize}px`, '--active-ink': props.color, '--tool-cursor': toolCursor(props.tool, props.color) } as React.CSSProperties}
    onPointerDown={event => { if (event.button === 0) pointer.current = { x: event.clientX, y: event.clientY } }}
    onPointerUp={event => {
      if (event.button !== 0 || !editor) return
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-analysis-id]')
      const moved = !pointer.current || Math.hypot(event.clientX - pointer.current.x, event.clientY - pointer.current.y) > 4
      const coords = { left: event.clientX, top: event.clientY }
      const extend = event.shiftKey
      pointer.current = null
      requestAnimationFrame(() => {
        if (!moved && !extend && target) {
          const position = editor.view.posAtCoords(coords)
          const range = position && analysisAt(editor.state.doc, position.pos, target.dataset.analysisId)
          if (range && canAnalyze(editor.state.doc, range)) {
            editor.commands.setTextSelection(position!.pos)
            current.current.onOpenAnalysis({ id: range.id, from: range.from })
            return
          }
        }
        if (!editor.state.selection.empty) apply()
      })
    }}
    onKeyDownCapture={event => {
      const target = event.target as HTMLElement
      if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || !['Enter', ' '].includes(event.key) || !target.matches('[data-analysis-id][role="button"]')) return
      event.preventDefault()
      event.stopPropagation()
      const range = analysisAt(editor!.state.doc, editor!.view.posAtDOM(target, 0), target.dataset.analysisId)
      if (range && canAnalyze(editor!.state.doc, range)) current.current.onOpenAnalysis({ id: range.id, from: range.from })
    }}
    onContextMenu={event => {
      event.preventDefault()
      if (!editor) return
      const position = editor.view.posAtCoords({ left: event.clientX, top: event.clientY })
      if (!position) return
      const request = wordFromArticle(editor, current.current.note, position.pos)
      if (request) current.current.onLookup(request)
    }}
    onKeyUp={event => { if (event.key === 'Shift' || event.shiftKey) apply() }}>
    <EditorContent editor={editor} />
    {menu && <div className="sentence-menu" role="menu" aria-label="调整分句" style={{ left: Math.min(Math.max(12, menu.left), window.innerWidth - 244), top: Math.min(menu.top, window.innerHeight - 190) }} onPointerDown={event => event.stopPropagation()} onKeyDown={event => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
      buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus()
    }}>
      <span>第 {menu.index + 1} 句 · 只调整显示</span>
      <button autoFocus role="menuitem" disabled={menu.from === menu.paragraph} onClick={() => correct('join')}>与上一句合并</button>
      <button role="menuitem" disabled={menu.caret <= menu.from || menu.caret >= menu.to || !editor?.state.selection.empty} onClick={() => correct('split')}>在文字光标处分句</button>
      <button role="menuitem" onClick={() => correct('reset')}>恢复本篇自动分句</button>
    </div>}
  </div>
}
