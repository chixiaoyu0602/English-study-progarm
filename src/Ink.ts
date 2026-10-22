import { Mark, mergeAttributes } from '@tiptap/core'
import { isColor } from '../shared/schema.js'

export const Ink = Mark.create({
  name: 'ink',
  inclusive: false,
  addAttributes() {
    return {
      color: { default: '#f3cf62', parseHTML: element => isColor(element.dataset.color) ? element.dataset.color : '#f3cf62' },
      width: { default: 'wide', parseHTML: element => element.dataset.width === 'fine' ? 'fine' : 'wide' },
    }
  },
  parseHTML() { return [{ tag: 'span[data-ink]' }] },
  renderHTML({ HTMLAttributes }) {
    const color = isColor(HTMLAttributes.color) ? HTMLAttributes.color : '#f3cf62'
    const width = HTMLAttributes.width === 'fine' ? 'fine' : 'wide'
    return ['span', mergeAttributes({ 'data-ink': '', 'data-color': color, 'data-width': width, class: `ink ink-${width}`, style: `--ink-color:${color}` }), 0]
  },
})
