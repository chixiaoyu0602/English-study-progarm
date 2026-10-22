import { useEffect, useRef } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import type { Editor, JSONContent } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Ink, paintSelection } from './Ink'
import { toolCursor } from './cursor'
import type { Note } from './model'
import { MAX_TEXT } from '../shared/schema.js'
import { wordFromArticle, type WordRequest } from './reading'

export type Tool = 'text' | 'wide' | 'fine' | 'erase'
interface Props {
  note: Note; tool: Tool; color: string; fontSize: number;
  onChange: (content: JSONContent) => void; onReady: (editor: Editor | null) => void;
  onSelection: (selected: boolean) => void; onLimit: () => void; onLayerLimit: () => void;
  onLookup: (request: WordRequest) => void;
}
export default function NoteEditor(props: Props) {
  const current = useRef(props)
  current.current = props
  const editor = useEditor({
    extensions: [StarterKit.configure({
      blockquote: false, bold: false, bulletList: false, code: false, codeBlock: false,
      dropcursor: false, gapcursor: false, heading: false, horizontalRule: false,
      italic: false, link: false, listItem: false, listKeymap: false, orderedList: false,
      strike: false, underline: false, trailingNode: false,
    }), Ink],
    content: props.note.content,
    editorProps: {
      attributes: { 'aria-label': '笔记正文', role: 'textbox', 'aria-multiline': 'true', spellcheck: 'false', 'data-placeholder': '把文字粘贴在这里，让阅读从这一页开始…' },
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
    onUpdate: ({ editor }) => current.current.onChange(editor.getJSON()),
    onSelectionUpdate: ({ editor }) => current.current.onSelection(!editor.state.selection.empty),
  })
  useEffect(() => {
    props.onReady(editor)
    return () => props.onReady(null)
  }, [editor]) // The editor is recreated when the active note changes.

  const apply = () => {
    if (!editor || editor.state.selection.empty || current.current.tool === 'text') return
    if (!paintSelection(editor, current.current.tool, current.current.color)) { current.current.onLayerLimit(); return }
    current.current.onSelection(false)
  }
  return <div className={`editor-body tool-${props.tool}`} style={{ '--reading-size': `${props.fontSize}px`, '--active-ink': props.color, '--tool-cursor': toolCursor(props.tool, props.color) } as React.CSSProperties}
    onPointerUp={event => { if (event.button === 0) requestAnimationFrame(apply) }}
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
  </div>
}
