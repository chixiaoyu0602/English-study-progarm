import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { Editor } from '@tiptap/core'
import { Check, Eraser, Highlighter, MousePointer2, Plus, Redo2, Underline, Undo2, X } from 'lucide-react'
import { analysisRange, paintAnalysis } from './Ink'
import type { AnalysisTarget, InkLayer } from './ink-ranges'
import type { Tool } from './Editor'
import { COLORS } from './model'
import { inkLayers } from '../shared/schema.js'
import { inkBackground } from '../shared/ink-colors.js'
import { toolCursor } from './cursor'

interface Props {
  source: Editor; target: AnalysisTarget; color: string; customColors: string[]; fontSize: number;
  saveState: 'saving' | 'saved' | 'error'; saveError: string;
  onColor: (color: string, custom?: boolean) => void; onClose: () => void; onLimit: () => void;
}

// DOM selection offsets count only text. Translate them through the source
// spans so paragraphs, hard breaks and existing marks cannot shift annotations.
function selectedSource(container: HTMLElement | null) {
  const selection = window.getSelection()
  if (!container || !selection?.rangeCount || selection.isCollapsed) return null
  const range = selection.getRangeAt(0)
  if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) return null
  const prefix = document.createRange()
  prefix.selectNodeContents(container); prefix.setEnd(range.startContainer, range.startOffset)
  const start = prefix.toString().length
  prefix.setEnd(range.endContainer, range.endOffset)
  const end = prefix.toString().length
  let offset = 0, from: number | undefined, to: number | undefined
  for (const span of container.querySelectorAll<HTMLElement>('[data-source-from]')) {
    const length = span.textContent!.length, position = Number(span.dataset.sourceFrom)
    if (from === undefined && start < offset + length) from = position + Math.max(0, start - offset)
    if (end > offset && end <= offset + length) { to = position + end - offset; break }
    offset += length
  }
  return from !== undefined && to !== undefined && from < to ? { from, to } : null
}

export default function AnalysisPanel(props: Props) {
  const { source, target } = props
  const [, redraw] = useState(0)
  const [tool, setTool] = useState<Tool>('text')
  const [selected, setSelected] = useState(false)
  const text = useRef<HTMLDivElement>(null), dialog = useRef<HTMLElement>(null), close = useRef<HTMLButtonElement>(null)
  const backdropPress = useRef(false)
  const latest = useRef(props); latest.current = props
  const range = analysisRange(source.state.doc, target)
  useEffect(() => {
    const update = () => { redraw(value => value + 1); window.getSelection()?.removeAllRanges() }
    source.on('transaction', update)
    return () => { source.off('transaction', update) }
  }, [source])
  useEffect(() => {
    if (!range) latest.current.onClose()
  }, [range?.from, range?.to])
  useLayoutEffect(() => {
    const active = document.activeElement as HTMLElement | null
    const previous = active && source.view.dom.contains(active) ? active : null
    close.current?.focus()
    const update = () => setSelected(!!selectedSource(text.current))
    document.addEventListener('selectionchange', update)
    // Clear the panel selection before the next browser interaction. A passive
    // cleanup can run after a new article selection and accidentally erase it.
    return () => { document.removeEventListener('selectionchange', update); window.getSelection()?.removeAllRanges(); if (previous?.isConnected) previous.focus(); else if (!source.isDestroyed) source.view.focus() }
  }, [])

  const paint = (nextTool: Tool, color = props.color) => {
    setTool(nextTool)
    const selection = selectedSource(text.current)
    if (nextTool === 'text' || !selection) return
    if (!paintAnalysis(source, target, selection.from, selection.to, nextTool, color)) props.onLimit()
    window.getSelection()?.removeAllRanges(); setSelected(false)
  }
  const choose = (color: string, custom = false) => { props.onColor(color, custom); paint(tool === 'fine' ? 'fine' : 'wide', color) }
  const apply = () => { if (tool !== 'text') paint(tool) }
  if (!range) return null

  const paragraphs: ReactNode[] = []
  source.state.doc.forEach((paragraph, paragraphFrom) => {
    if (paragraphFrom >= range.to || paragraphFrom + paragraph.nodeSize <= range.from) return
    const children: ReactNode[] = []
    paragraph.forEach((node, offset) => {
      const position = paragraphFrom + 1 + offset
      const from = Math.max(position, range.from), to = Math.min(position + node.nodeSize, range.to)
      if (from >= to) return
      if (!node.isText) { if (node.type.name === 'hardBreak') children.push(<br key={position} />); return }
      const layers: InkLayer[] = inkLayers(node.marks.find(mark => mark.type.name === 'ink')?.attrs).filter((layer: InkLayer) => layer.parent === target.id)
      const wide = layers.filter(layer => layer.width === 'wide').at(-1)
      const fine = layers.filter(layer => layer.width === 'fine')
      const style = { '--ink-light': inkBackground(wide ? { ...wide, depth: 0 } : undefined, fine, 'light'), '--ink-dark': inkBackground(wide ? { ...wide, depth: 0 } : undefined, fine, 'dark') } as CSSProperties
      children.push(<span key={position} data-source-from={from} data-detail-ink={layers.length ? '' : undefined} data-color={layers.at(-1)?.color} data-wide-color={wide?.color} className={layers.length ? 'ink-surface' : undefined} style={style}>{node.text!.slice(from - position, to - position)}</span>)
    })
    paragraphs.push(<p key={paragraphFrom}>{children.length ? children : <br />}</p>)
  })

  return <div className="analysis-backdrop" onPointerDown={event => { backdropPress.current = event.target === event.currentTarget }} onClick={event => { if (backdropPress.current && event.target === event.currentTarget) props.onClose() }}>
    <section ref={dialog} className="analysis-panel" role="dialog" aria-modal="true" aria-labelledby="analysis-title" onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); props.onClose(); return }
      if (event.key === 'Tab') {
        const items = dialog.current!.querySelectorAll<HTMLElement>('button:not([disabled]), input, [tabindex="0"]')
        const first = items[0], last = items[items.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
      if (!(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLowerCase()
      if (key === 'a' && text.current?.contains(event.target as Node)) {
        event.preventDefault(); const selection = window.getSelection()!, all = document.createRange()
        all.selectNodeContents(text.current!); selection.removeAllRanges(); selection.addRange(all)
      }
      if (key === 'z' || key === 'y') { event.preventDefault(); event.stopPropagation(); if (key === 'y' || event.shiftKey) source.commands.redo(); else source.commands.undo() }
      if (event.shiftKey && ['h', 'u', 'e'].includes(key)) { event.preventDefault(); event.stopPropagation(); paint(key === 'h' ? 'wide' : key === 'u' ? 'fine' : 'erase') }
    }}>
      <header className="analysis-header"><div><span className="analysis-level">第二层</span><h2 id="analysis-title">片段分析</h2></div><button ref={close} className="icon-button" aria-label="关闭片段分析" onClick={props.onClose}><X size={21} /></button></header>
      <div className="analysis-toolbar" aria-label="片段标注工具">
        <div className="tool-group" onMouseDown={event => event.preventDefault()}>
          <button className={`tool-button ${tool === 'text' ? 'active' : ''}`} aria-label="选择文字" aria-pressed={tool === 'text'} onClick={() => paint('text')}><MousePointer2 size={18} />选择</button>
          <button className={`tool-button ${tool === 'wide' ? 'active' : ''}`} aria-label="粗记号笔" aria-pressed={tool === 'wide'} onClick={() => paint('wide')}><Highlighter size={18} />粗笔</button>
          <button className={`tool-button ${tool === 'fine' ? 'active' : ''}`} aria-label="细记号笔" aria-pressed={tool === 'fine'} onClick={() => paint('fine')}><Underline size={18} />细笔</button>
          <button className={`tool-button ${tool === 'erase' ? 'active' : ''}`} aria-label="橡皮擦" aria-pressed={tool === 'erase'} onClick={() => paint('erase')}><Eraser size={18} /></button>
        </div>
        <div className="undo-group" onMouseDown={event => event.preventDefault()}><button className="icon-button" aria-label="撤销" disabled={!source.can().undo()} onClick={() => source.commands.undo()}><Undo2 size={18} /></button><button className="icon-button" aria-label="重做" disabled={!source.can().redo()} onClick={() => source.commands.redo()}><Redo2 size={18} /></button></div>
        <div className="palette" role="group" aria-label="片段记号笔颜色">
          {[...COLORS, ...props.customColors.filter(color => !COLORS.some(preset => preset.value === color)).map(color => ({ name: `自定义颜色 ${color}`, value: color }))].map(color => <button key={color.value} className={`swatch ${props.color === color.value ? 'chosen' : ''}`} aria-label={color.name} title={color.name} aria-pressed={props.color === color.value} style={{ '--swatch': color.value } as CSSProperties} onMouseDown={event => event.preventDefault()} onClick={() => choose(color.value)}>{props.color === color.value && <Check size={13} />}</button>)}
          <label className="custom-color analysis-custom" title="自定义颜色"><Plus size={14} /><input type="color" aria-label="自定义片段颜色" value={props.color} onChange={event => choose(event.target.value, true)} /></label>
        </div>
      </div>
      <div ref={text} className={`analysis-text tool-${tool}`} role="textbox" aria-label="片段文字" aria-readonly="true" aria-multiline="true" tabIndex={0} style={{ '--reading-size': `${props.fontSize}px`, '--active-ink': props.color, '--tool-cursor': toolCursor(tool, props.color) } as CSSProperties} onPointerUp={event => { if (event.button === 0) requestAnimationFrame(apply) }} onKeyUp={event => { if (event.key === 'Shift') apply() }}>{paragraphs}</div>
      <footer className="analysis-footer"><span className="analysis-hint">{selected ? '选择颜色或记号笔，为选中文字标注' : '拖选文字，分析片段内部的句子成分'}</span><span role="status" className={props.saveState === 'error' ? 'analysis-save-error' : ''}><Check size={14} />{props.saveState === 'error' ? `保存失败：${props.saveError}` : props.saveState === 'saving' ? '正在保存内部标记…' : '内部标记已保存 · 主文保持第一层颜色'}</span></footer>
    </section>
  </div>
}
