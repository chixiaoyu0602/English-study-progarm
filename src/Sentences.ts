import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { emptySentenceBreaks, sentenceRanges } from '../shared/reading.js'
import type { SentenceBreaks } from './model'

interface SentenceState { enabled: boolean; breaks: SentenceBreaks; decorations: DecorationSet }
export interface SentenceMenu { from: number; to: number; paragraph: number; index: number; left: number; top: number; caret: number }
export const sentenceKey = new PluginKey<SentenceState>('sentence-reading')

export const Sentences = Extension.create<{
  enabled: boolean; breaks: SentenceBreaks; onMenu: (menu: SentenceMenu) => void;
}>({
  name: 'sentences',
  addOptions: () => ({ enabled: true, breaks: emptySentenceBreaks(), onMenu: () => {} }),
  addProseMirrorPlugins() {
    const options = this.options
    const decorate = (doc: Parameters<typeof sentenceRanges>[0], enabled: boolean, breaks: SentenceBreaks) => {
      if (!enabled) return DecorationSet.empty
      return DecorationSet.create(doc, sentenceRanges(doc, breaks).map((range, i) => Decoration.widget(range.from, view => {
        const wrapper = document.createElement('span')
        wrapper.className = `sentence-start ${range.first ? 'paragraph-start' : ''}`
        wrapper.contentEditable = 'false'
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'sentence-number'
        button.dataset.number = String(i + 1).padStart(2, '0')
        button.setAttribute('aria-label', `第 ${i + 1} 句分句选项`)
        button.title = '调整分句'
        button.setAttribute('aria-haspopup', 'menu')
        button.addEventListener('mousedown', event => event.preventDefault())
        button.addEventListener('click', event => {
          event.preventDefault(); event.stopPropagation()
          const rect = button.getBoundingClientRect()
          options.onMenu({ ...range, index: i, left: rect.left, top: rect.bottom + 5, caret: view.state.selection.from })
        })
        wrapper.append(button)
        return wrapper
      }, { side: -1, marks: [], stopEvent: () => true, ignoreSelection: true })))
    }
    return [new Plugin<SentenceState>({
      key: sentenceKey,
      state: {
        init: (_, state) => ({ enabled: options.enabled, breaks: options.breaks, decorations: decorate(state.doc, options.enabled, options.breaks) }),
        apply(tr, previous) {
          const meta = tr.getMeta(sentenceKey) as { enabled?: boolean; breaks?: SentenceBreaks } | undefined
          if (!tr.docChanged && !meta) return previous
          const enabled = meta?.enabled ?? previous.enabled
          const map = (positions: number[]) => [...new Set(positions.flatMap(pos => {
            const mapped = tr.mapping.mapResult(pos, 1)
            return mapped.deleted || mapped.pos <= 0 || mapped.pos >= tr.doc.content.size ? [] : [mapped.pos]
          }))].sort((a, b) => a - b)
          const breaks = meta?.breaks ?? (tr.docChanged ? { split: map(previous.breaks.split), join: map(previous.breaks.join) } : previous.breaks)
          return { enabled, breaks, decorations: decorate(tr.doc, enabled, breaks) }
        },
      },
      props: { decorations: state => sentenceKey.getState(state)?.decorations },
    })]
  },
})
