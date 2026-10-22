import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Editor, JSONContent } from '@tiptap/core'
import { ArrowDownToLine, ArrowUpFromLine, BookOpen, Check, CircleHelp, Eraser, Highlighter, LoaderCircle, Minus, Moon, NotebookPen, PanelLeftClose, PanelLeftOpen, Plus, Redo2, Search, Sun, Trash2, Type, Underline, Undo2, X } from 'lucide-react'
import NoteEditor, { type Tool } from './Editor'
import { paintSelection } from './Ink'
import { COLORS, downloadBackup, initialNotebook, newNote, type Notebook, type Note, type WordSource } from './model'
import { docText, isColor, MAX_FILE_BYTES, MAX_NOTES, MAX_VOCABULARY, mergeNotebooks, parseNotebook, validateNotebook } from '../shared/schema.js'
import { wordFromArticle, type WordRequest } from './reading'
import type { DictionaryEntry } from './dictionary'
import DictionaryCard from './DictionaryCard'
import Wordbook from './Wordbook'
import AnalysisPanel from './AnalysisPanel'
import { primaryBlockCount } from '../shared/annotations.js'
import type { AnalysisTarget } from './ink-ranges'
import packageInfo from '../package.json'

const appVersion = packageInfo.version
const STORAGE_KEY = 'marknote.notebook.v1'
function dateLabel(time: number) { return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(time) }

export default function App() {
  const [loaded, setLoaded] = useState<{ book: Notebook; error?: string; warning?: string } | null>(null)
  useEffect(() => {
    let live = true
    const load = async () => {
      try {
        if (window.desktop) {
          const result = await window.desktop.load()
          if (!result.ok) throw new Error(result.error)
          if (live) setLoaded({ book: result.data ? validateNotebook(result.data) : initialNotebook(), warning: result.warning })
        } else {
          const stored = localStorage.getItem(STORAGE_KEY)
          if (live) setLoaded({ book: stored ? parseNotebook(stored) : initialNotebook() })
        }
      } catch (error) { if (live) setLoaded({ book: initialNotebook(), error: error instanceof Error ? error.message : '读取笔记失败。' }) }
    }
    void load()
    return () => { live = false }
  }, [])
  if (!loaded) return <div className="loading"><NotebookPen size={36} /><p>正在打开你的笔记…</p></div>
  return <Notebook initial={loaded.book} loadError={loaded.error} warning={loaded.warning} />
}

function Notebook({ initial, loadError, warning }: { initial: Notebook; loadError?: string; warning?: string }) {
  const [book, setBook] = useState(initial)
  const bookRef = useRef(book)
  bookRef.current = book
  const [tool, setTool] = useState<Tool>('text')
  const [view, setView] = useState<'notes' | 'vocabulary'>('notes')
  const [lookup, setLookup] = useState<WordRequest | null>(null)
  const [analysis, setAnalysis] = useState<{ noteId: string; target: AnalysisTarget } | null>(null)
  const analysisRef = useRef(analysis); analysisRef.current = analysis
  const [editor, setEditor] = useState<Editor | null>(null)
  const analysisWasOpen = useRef(false)
  useLayoutEffect(() => {
    const closed = analysisWasOpen.current && !analysis
    analysisWasOpen.current = !!analysis
    // The parent's layout runs after inert has been removed from the article.
    // Focusing during the dialog's unmount cleanup is too early for the browser.
    if (closed && editor && !editor.isDestroyed && editor.view.dom.isConnected) editor.view.focus()
  }, [analysis, editor])
  const [selection, setSelection] = useState(false)
  const [query, setQuery] = useState('')
  const [sidebar, setSidebar] = useState(true)
  const [colorsOpen, setColorsOpen] = useState(false)
  const [customColor, setCustomColor] = useState('#e6a967')
  const [help, setHelp] = useState(false)
  const [deleting, setDeleting] = useState<Note | null>(null)
  const [toast, setToast] = useState(warning || '')
  const [saveState, setSaveState] = useState<'saving' | 'saved' | 'error'>('saved')
  const [saveError, setSaveError] = useState(loadError || '')
  const [busy, setBusy] = useState(false)
  const revision = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const input = useRef<HTMLInputElement>(null)
  const pending = useRef<Promise<boolean>>(Promise.resolve(true))
  const current = book.notes.find(note => note.id === book.activeId) || null
  useEffect(() => {
    if (analysis && (analysis.noteId !== current?.id || view !== 'notes')) setAnalysis(null)
  }, [analysis, current?.id, view])
  const visibleNotes = book.notes.filter(note => `${note.title}\n${docText(note.content)}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a, b) => b.updatedAt - a.updatedAt)
  const text = current ? docText(current.content) : ''
  const marks = current ? primaryBlockCount(current.content) : 0
  const notify = useCallback((message: string) => setToast(message), [])
  useEffect(() => { if (!toast) return; const timeout = setTimeout(() => setToast(''), 4200); return () => clearTimeout(timeout) }, [toast])
  useEffect(() => { document.documentElement.dataset.theme = book.theme }, [book.theme])

  const persist = useCallback(async () => {
    clearTimeout(timer.current)
    if (loadError) return false
    const snapshot = bookRef.current
    const id = ++revision.current
    setSaveState('saving')
    pending.current = pending.current.catch(() => false).then(async () => {
      try {
        validateNotebook(snapshot)
        if (new TextEncoder().encode(JSON.stringify(snapshot)).length > MAX_FILE_BYTES) throw new Error('笔记库超过 10 MB。请导出备份并精简内容。')
        if (window.desktop) {
          const result = await window.desktop.save(snapshot)
          if (!result.ok) throw new Error(result.error)
        } else localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
        if (id === revision.current) { setSaveState('saved'); setSaveError('') }
        return true
      } catch (error) {
        setSaveState('error')
        setSaveError(error instanceof Error ? error.message : '保存失败，请导出备份。')
        return false
      }
    })
    return await pending.current
  }, [loadError])
  useEffect(() => {
    if (loadError) { setSaveState('error'); return }
    setSaveState('saving')
    timer.current = setTimeout(() => void persist(), 250)
    return () => clearTimeout(timer.current)
  }, [book, persist, loadError])
  useEffect(() => {
    const flush = () => { void persist() }
    const unload = (event: BeforeUnloadEvent) => {
      if (!window.desktop) {
        try { if (!loadError) localStorage.setItem(STORAGE_KEY, JSON.stringify(bookRef.current)) }
        catch { event.preventDefault(); event.returnValue = '' }
      }
    }
    const off = window.desktop?.onFlush(persist)
    window.addEventListener('beforeunload', unload)
    window.addEventListener('blur', flush)
    return () => { off?.(); window.removeEventListener('beforeunload', unload); window.removeEventListener('blur', flush) }
  }, [persist, loadError])

  const editNote = (id: string, changes: Partial<Note>) => setBook(previous => ({ ...previous, notes: previous.notes.map(note => note.id === id ? { ...note, ...changes, updatedAt: Date.now() } : note) }))
  const addNote = useCallback(() => {
    if (bookRef.current.notes.length >= MAX_NOTES) { notify('最多支持 500 篇笔记，请先导出备份再整理。'); return }
    const note = newNote()
    setView('notes'); setLookup(null)
    setBook(previous => ({ ...previous, notes: [note, ...previous.notes], activeId: note.id }))
    setTool('text'); setQuery(''); setSelection(false)
    setTimeout(() => document.querySelector<HTMLInputElement>('.note-title')?.focus(), 30)
  }, [notify])
  const lookupSelected = () => {
    const request = view === 'notes' && editor && current ? wordFromArticle(editor, current) : null
    if (!request) { notify('请选中一个完整的英文单词，或在文章中的单词上点击右键。'); return }
    setLookup(request); setColorsOpen(false)
  }
  const saveWord = (entry: DictionaryEntry, source: WordSource | null) => {
    const previous = bookRef.current
    if (previous.vocabulary.some(word => word.word === entry.word)) { notify('这个单词已经在单词本里了。'); return }
    if (previous.vocabulary.length >= MAX_VOCABULARY) { notify('单词本最多支持 5000 个单词，请先导出备份再整理。'); return }
    const next = { ...previous, vocabulary: [{ word: entry.word, phonetic: entry.phonetic, meaning: entry.meaning, source, addedAt: Date.now() }, ...previous.vocabulary] }
    if (new TextEncoder().encode(JSON.stringify(next, null, 2)).length > MAX_FILE_BYTES) { notify('笔记库已达到 10 MB，请先导出备份并整理内容。'); return }
    setBook(next)
    notify(`${entry.word} 已加入单词本。`)
  }
  const paint = (nextTool: Tool, color = book.color) => {
    setTool(nextTool)
    if (nextTool === 'wide' || nextTool === 'fine') setBook(previous => ({ ...previous, pen: nextTool }))
    if (!editor || editor.state.selection.empty || nextTool === 'text') return
    if (!paintSelection(editor, nextTool, color)) { notify('无法完成标注，请重新选择文字。'); return }
    setSelection(false)
  }
  const chooseColor = (color: string) => {
    setBook(previous => ({ ...previous, color }))
    paint(tool === 'wide' || tool === 'fine' ? tool : book.pen, color)
  }
  const exportAll = async () => {
    setBusy(true)
    try {
      if (window.desktop) {
        const result = await window.desktop.export(bookRef.current)
        if (!result.ok) throw new Error(result.error)
        if (!result.canceled) notify('全部笔记已导出，标注和单词本也一起保存了。')
      } else { downloadBackup(bookRef.current); notify('笔记和单词本备份已下载。') }
    } catch (error) { notify(error instanceof Error ? error.message : '导出失败。') }
    finally { setBusy(false) }
  }
  const mergeImport = (imported: Notebook) => {
    const merged = mergeNotebooks(bookRef.current, imported)
    setBook(merged.book); setQuery(''); setTool('text'); setSelection(false); setLookup(null)
    setView(merged.importedNotes ? 'notes' : merged.importedWords ? 'vocabulary' : view)
    notify(`已导入 ${merged.importedNotes} 篇笔记、${merged.importedWords} 个单词，已有内容已保留。`)
  }
  const importAll = async () => {
    if (!window.desktop) { input.current?.click(); return }
    setBusy(true)
    try {
      const result = await window.desktop.import()
      if (!result.ok) throw new Error(result.error)
      if (result.data) mergeImport(result.data)
    } catch (error) { notify(error instanceof Error ? error.message : '导入失败。') }
    finally { setBusy(false) }
  }
  const importFile = async (file?: File) => {
    if (!file) return
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error('备份不能超过 10 MB。')
      mergeImport(parseNotebook(await file.text()))
    } catch (error) { notify(error instanceof Error ? error.message : '导入失败。') }
    finally { if (input.current) input.current.value = '' }
  }
  const deleteNote = () => {
    if (!deleting) return
    setBook(previous => {
      const notes = previous.notes.filter(note => note.id !== deleting.id)
      return { ...previous, notes, activeId: previous.activeId === deleting.id ? notes[0]?.id || null : previous.activeId }
    })
    setDeleting(null); setSelection(false)
    notify('笔记已删除。')
  }
  const actionsRef = useRef({ addNote, paint, persist, lookupSelected })
  actionsRef.current = { addNote, paint, persist, lookupSelected }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (analysisRef.current) {
        if (event.key === 'Escape') setAnalysis(null)
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void actionsRef.current.persist() }
        return
      }
      if (event.key === 'Escape') { setHelp(false); setColorsOpen(false); setDeleting(null); setLookup(null); setTool('text') }
      if (!(event.ctrlKey || event.metaKey)) return
      if (event.key.toLowerCase() === 'n') { event.preventDefault(); actionsRef.current.addNote() }
      if (event.key.toLowerCase() === 's') { event.preventDefault(); void actionsRef.current.persist() }
      if (event.key.toLowerCase() === 'd') { event.preventDefault(); actionsRef.current.lookupSelected() }
      if (event.shiftKey && ['h', 'u', 'e'].includes(event.key.toLowerCase())) {
        event.preventDefault()
        actionsRef.current.paint(event.key.toLowerCase() === 'h' ? 'wide' : event.key.toLowerCase() === 'u' ? 'fine' : 'erase')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const saveStatus = <div className="save-status" role="status">{saveState === 'saving' ? <LoaderCircle size={13} className="spin" /> : saveState === 'error' ? <span className="error-dot" /> : <Check size={14} />}<span>{saveState === 'saving' ? '正在保存' : saveState === 'error' ? '保存失败' : '已保存到本机'}</span></div>

  return <><div className={`app ${sidebar ? '' : 'sidebar-collapsed'}`} inert={!!analysis}>
    {sidebar && <aside className="sidebar" aria-label="笔记列表">
      <div className="brand"><span className="brand-icon"><NotebookPen size={23} strokeWidth={1.7} /></span><div><strong>拾光笔记</strong><span>MARKNOTE</span></div></div>
      <button className="new-note" onClick={addNote}><Plus size={18} /> 新建笔记 <kbd>Ctrl N</kbd></button>
      <label className="search"><Search size={16} /><input aria-label="搜索笔记" placeholder="搜索你的笔记" value={query} onChange={event => setQuery(event.target.value)} />{query && <button aria-label="清空搜索" onClick={() => setQuery('')}><X size={13} /></button>}</label>
      <button className={`wordbook-nav ${view === 'vocabulary' ? 'active' : ''}`} aria-label="打开单词本" aria-pressed={view === 'vocabulary'} onClick={() => { setView('vocabulary'); setLookup(null); setColorsOpen(false) }}><BookOpen size={17} /><span>单词本</span><span className="wordbook-count">{book.vocabulary.length}</span></button>
      <div className="list-heading"><span>全部笔记</span><span>{book.notes.length}</span></div>
      <div className="note-list">
        {visibleNotes.map(note => <button key={note.id} className={`note-card ${view === 'notes' && note.id === book.activeId ? 'selected' : ''}`} onClick={() => { setBook(previous => ({ ...previous, activeId: note.id })); setSelection(false); setView('notes'); setLookup(null) }}>
          <span className="card-title">{note.title.trim() || '未命名笔记'}</span>
          <span className="card-preview">{docText(note.content).trim() || '从一段文字开始…'}</span>
          <span className="card-meta">{dateLabel(note.updatedAt)}<span className="card-dot" /></span>
        </button>)}
        {!visibleNotes.length && <div className="list-empty">{query ? '没有找到相关笔记' : '你的下一页，等你来写。'}</div>}
      </div>
      <div className="sidebar-bottom"><span className="offline-dot" /> 本地保存，安心书写 <span>v{appVersion}</span></div>
    </aside>}
    <main className="main">
      <header className="topbar">
        <div className="topbar-left"><button className="icon-button" aria-label={sidebar ? '收起侧栏' : '展开侧栏'} title={sidebar ? '收起侧栏' : '展开侧栏'} onClick={() => setSidebar(!sidebar)}>{sidebar ? <PanelLeftClose size={19} /> : <PanelLeftOpen size={19} />}</button><span className="breadcrumb">我的笔记 <span>/</span> <strong>{view === 'vocabulary' ? '单词本' : current?.title.trim() || (current ? '未命名笔记' : '开始记录')}</strong></span></div>
        <div className="topbar-actions"><button className="icon-button" title="使用帮助" aria-label="使用帮助" onClick={() => setHelp(true)}><CircleHelp size={18} /></button><span className="topbar-divider" /><button className="theme-switch" onClick={() => setBook(previous => ({ ...previous, theme: previous.theme === 'light' ? 'dark' : 'light' }))} aria-label={book.theme === 'light' ? '切换到夜间模式' : '切换到日间模式'}><span className={book.theme === 'light' ? 'active' : ''}><Sun size={15} /></span><span className={book.theme === 'dark' ? 'active' : ''}><Moon size={15} /></span></button><button className="export-button" aria-label="导出备份" title="导出全部笔记备份" onClick={() => void exportAll()} disabled={busy}><ArrowUpFromLine size={15} /><span>导出备份</span></button></div>
      </header>
      {saveError && <div className="error-banner" role="alert">{saveError} {loadError ? '请先导出当前内容；原文件不会被覆盖。' : '请导出备份，避免丢失。'}</div>}
      {view === 'vocabulary' && <><Wordbook words={book.vocabulary} notes={book.notes} onLookup={query => setLookup({ query, source: null })} onRemove={word => { setBook(previous => ({ ...previous, vocabulary: previous.vocabulary.filter(entry => entry.word !== word) })); notify(`${word} 已移出单词本。`) }} onOpenNote={id => { setBook(previous => ({ ...previous, activeId: id })); setView('notes'); setLookup(null); setTool('text') }} /><footer className="statusbar">{saveStatus}<span>内置英汉词典 · 离线可用</span><span>{book.vocabulary.length} 个单词</span></footer></>}
      <div className={`reading-view ${view === 'vocabulary' ? 'reading-hidden' : ''}`}>
      {current ? <>
        <section className="toolbar" aria-label="标注工具">
          <div className="tool-group" onMouseDown={event => event.preventDefault()}>
            <button className={`tool-button ${tool === 'text' ? 'active' : ''}`} aria-label="编辑文字" aria-pressed={tool === 'text'} title="编辑文字 · Esc" onClick={() => paint('text')}><Type size={19} /><span>文字</span></button>
            <button className={`tool-button ${tool === 'wide' ? 'active' : ''}`} aria-label="粗记号笔" aria-pressed={tool === 'wide'} title="粗记号笔 · Ctrl Shift H" onClick={() => paint('wide')}><Highlighter size={19} /><span>粗笔</span></button>
            <button className={`tool-button ${tool === 'fine' ? 'active' : ''}`} aria-label="细记号笔" aria-pressed={tool === 'fine'} title="细记号笔 · Ctrl Shift U" onClick={() => paint('fine')}><Underline size={19} /><span>细笔</span></button>
            <button className={`tool-button erase-button ${tool === 'erase' ? 'active' : ''}`} aria-label="橡皮擦" aria-pressed={tool === 'erase'} title="拖选文字，擦除主文标记 · Ctrl Shift E" onClick={() => paint('erase')}><Eraser size={18} /></button>
          </div>
          <span className="toolbar-divider" />
          <div className="palette" role="group" aria-label="记号笔颜色">
            {COLORS.map(color => <button key={color.value} className={`swatch ${book.color === color.value ? 'chosen' : ''}`} aria-label={color.name} aria-pressed={book.color === color.value} title={color.name} style={{ '--swatch': color.value } as React.CSSProperties} onMouseDown={event => event.preventDefault()} onClick={() => chooseColor(color.value)}>{book.color === color.value && <Check size={13} />}</button>)}
            {book.customColors.map(color => <button key={color} className={`swatch ${book.color === color ? 'chosen' : ''}`} aria-label={`自定义颜色 ${color}`} aria-pressed={book.color === color} style={{ '--swatch': color } as React.CSSProperties} onMouseDown={event => event.preventDefault()} onClick={() => chooseColor(color)}>{book.color === color && <Check size={13} />}</button>)}
            <div className="color-anchor"><button className={`custom-color ${colorsOpen ? 'open' : ''}`} aria-label="自定义颜色" aria-expanded={colorsOpen} title="自定义颜色" onMouseDown={event => event.preventDefault()} onClick={() => setColorsOpen(!colorsOpen)}><Plus size={14} /></button>
              {colorsOpen && <div className="color-popover"><div className="popover-heading">调一抹喜欢的颜色<button className="icon-button" aria-label="关闭调色板" onClick={() => setColorsOpen(false)}><X size={14} /></button></div><div className="color-input-row"><input type="color" aria-label="选取自定义颜色" value={isColor(customColor) ? customColor : '#e6a967'} onChange={event => setCustomColor(event.target.value)} /><input className="hex-input" aria-label="十六进制颜色" value={customColor} maxLength={7} onChange={event => setCustomColor(event.target.value)} /></div><button className="primary-button" disabled={!isColor(customColor)} onClick={() => {
                const color = customColor.toLowerCase()
                setBook(previous => ({ ...previous, customColors: [...previous.customColors.filter(value => value !== color), color].slice(-8) }))
                chooseColor(color); setColorsOpen(false)
              }}>使用这个颜色 <Check size={14} /></button><p>最多保留最近 8 种自定义颜色</p></div>}
            </div>
          </div>
          <div className="toolbar-spacer" />
          <div className="reading-mode" role="group" aria-label="阅读模式"><button aria-pressed={book.readingMode === 'original'} onMouseDown={event => event.preventDefault()} onClick={() => setBook(previous => ({ ...previous, readingMode: 'original' }))}>原文</button><button aria-pressed={book.readingMode !== 'original'} onMouseDown={event => event.preventDefault()} onClick={() => setBook(previous => ({ ...previous, readingMode: 'sentences' }))}>逐句</button></div>
          <div className="undo-group" onMouseDown={event => event.preventDefault()}><button className="icon-button" title="撤销 · Ctrl Z" aria-label="撤销" disabled={!editor?.can().undo()} onClick={() => editor?.chain().focus().undo().run()}><Undo2 size={18} /></button><button className="icon-button" title="重做 · Ctrl Shift Z" aria-label="重做" disabled={!editor?.can().redo()} onClick={() => editor?.chain().focus().redo().run()}><Redo2 size={18} /></button></div>
          <button className="lookup-button" title="选中单词查释义并收藏 · Ctrl D" aria-label="查词并加入单词本" disabled={!selection} onMouseDown={event => event.preventDefault()} onClick={lookupSelected}><BookOpen size={17} /><span>查词</span></button>
        </section>
        <div className="paper-scroll">
          <article className="paper" aria-label="当前笔记">
            <div className="note-eyebrow"><span className="eyebrow-line" /> 留住此刻的灵感</div>
            <input className="note-title" aria-label="笔记标题" placeholder="未命名笔记" maxLength={200} value={current.title} onChange={event => editNote(current.id, { title: event.target.value })} />
            <div className="note-byline"><span>{dateLabel(current.createdAt)}</span><span>·</span><span>{text.replace(/\s/g, '').length.toLocaleString()} 字符</span><span className="byline-tag">随心记</span></div>
            <div className="paper-rule" />
            <NoteEditor key={current.id} note={current} tool={tool} color={book.color} fontSize={book.fontSize} readingMode={book.readingMode || 'sentences'} onChange={(content: JSONContent, sentenceBreaks) => editNote(current.id, { content, sentenceBreaks })} onReady={setEditor} onSelection={setSelection} onLimit={() => notify('每篇笔记最多支持 20 万字符。请新建笔记继续。')} onLayerLimit={() => notify('无法完成标注，请重新选择文字。')} onOpenAnalysis={target => { setAnalysis({ noteId: current.id, target }); setTool('text'); setSelection(false); setLookup(null); setColorsOpen(false) }} onLookup={request => { setLookup(request); setColorsOpen(false) }} />
            <div className="paper-end"><span /> <NotebookPen size={15} /> <span /></div>
          </article>
        </div>
        <footer className="statusbar">{saveStatus}<div className="tool-hint">{selection ? '选择一支记号笔，为选中文字标注' : tool === 'text' ? '点击短语色块分析成分，句号编号可调整分句' : tool === 'erase' ? '拖选文字，擦除主文标记；可撤销恢复' : `拖选文字，使用${tool === 'wide' ? '粗' : '细'}记号笔标注`}</div><div className="reading-size"><button aria-label="缩小字号" title="缩小字号" disabled={book.fontSize <= 16} onClick={() => setBook(previous => ({ ...previous, fontSize: previous.fontSize - 2 }))}><Minus size={13} /></button><span>{book.fontSize}</span><button aria-label="放大字号" title="放大字号" disabled={book.fontSize >= 28} onClick={() => setBook(previous => ({ ...previous, fontSize: previous.fontSize + 2 }))}><Plus size={13} /></button><span className="status-divider" /><span className="annotation-count">{marks} 处标注</span></div></footer>
      </> : <div className="empty-workspace"><div className="empty-icon"><NotebookPen size={36} strokeWidth={1.2} /></div><h1>新的一页，从这里开始</h1><p>写下灵感，粘贴好文，给值得记住的句子添一点颜色。</p><button className="primary-button" onClick={addNote}><Plus size={17} /> 新建第一篇笔记</button></div>}
      </div>
      <div className="library-actions"><button onClick={() => void importAll()} disabled={busy}><ArrowDownToLine size={15} /> 导入备份</button>{view === 'notes' && current && <button className="delete-note" onClick={() => setDeleting(current)} aria-label="删除当前笔记"><Trash2 size={15} /><span>删除笔记</span></button>}</div>
      {lookup && <DictionaryCard key={lookup.query} request={lookup} savedWords={new Set(book.vocabulary.map(entry => entry.word))} onSave={saveWord} onClose={() => setLookup(null)} />}
    </main>
    <input ref={input} type="file" accept=".marknote,.json" hidden onChange={event => void importFile(event.target.files?.[0])} />
    {toast && <div className="toast" role="status"><Check size={16} /><span>{toast}</span><button aria-label="关闭提示" onClick={() => setToast('')}><X size={14} /></button></div>}
    {(help || deleting) && <div className="modal-backdrop" onClick={() => { setHelp(false); setDeleting(null) }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title" onClick={event => event.stopPropagation()} onKeyDown={event => {
      if (event.key !== 'Tab') return
      const focusable = event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input')
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }}>
      <button autoFocus className="modal-close icon-button" aria-label="关闭对话框" onClick={() => { setHelp(false); setDeleting(null) }}><X size={19} /></button>
      {deleting ? <><div className="modal-symbol"><Trash2 size={25} /></div><h2 id="dialog-title">删除这篇笔记？</h2><p>「{deleting.title.trim() || '未命名笔记'}」将被永久删除。建议先导出备份，删除后无法撤销。</p><div className="modal-actions"><button className="secondary-button" onClick={() => setDeleting(null)}>保留笔记</button><button className="danger-button" onClick={deleteNote}>确认删除</button></div></> : <><div className="modal-symbol"><NotebookPen size={27} /></div><h2 id="dialog-title">一点颜色，记住更多</h2><p>拾光笔记 v{appVersion} · 为专注阅读而做</p><div className="help-steps"><div><span>01</span><p><strong>把文字放进来</strong>新建笔记，直接输入或粘贴文本。粘贴时会去除原有格式，让页面保持清爽。</p></div><div><span>02</span><p><strong>给重点一点颜色</strong>选择粗笔或细笔，再拖选文字。主文只显示第一层颜色。点击含多个单词的色块，打开不带外层底色的片段分析框，再在里面标注主谓宾等内部成分。只有主文和片段两层，内部标记自动保存。文字在主文修改，分析框会同步更新。</p></div><div><span>03</span><p><strong>安心留下你的记录</strong>文章中右键单词即可查中文释义并加入单词本，自动保留原句。也可选中单词按 Ctrl D。单词本里的喇叭可播放本地英语发音。用「原文／逐句」切换阅读方式，点击句子编号可修正分句。笔记和单词本一起自动保存、导出备份；导入会保留现有内容。</p></div></div><div className="shortcut-list"><span>查词收藏 <kbd>Ctrl D</kbd></span><span>新建笔记 <kbd>Ctrl N</kbd></span><span>撤销 <kbd>Ctrl Z</kbd></span><span>粗笔 <kbd>Ctrl Shift H</kbd></span><span>细笔 <kbd>Ctrl Shift U</kbd></span><span>橡皮擦 <kbd>Ctrl Shift E</kbd></span><span>回到文字 <kbd>Esc</kbd></span></div><p className="help-footnote">完全离线，无账号、无云同步。请定期导出备份。每篇最多 20 万字符，最多 500 篇，总备份不超过 10 MB。</p></>}
    </section></div>}
  </div>{analysis && editor && analysis.noteId === current?.id && <AnalysisPanel source={editor} target={analysis.target} color={book.color} customColors={book.customColors} fontSize={book.fontSize} saveState={saveState} saveError={saveError} onColor={(color, custom) => setBook(previous => ({ ...previous, color, customColors: custom ? [...new Set([color, ...previous.customColors])].slice(0, 8) : previous.customColors }))} onLimit={() => notify('这个位置保留了较多旧标记，请先擦除一些标记。')} onClose={() => setAnalysis(null)} />}</>
}
