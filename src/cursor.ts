import { isColor } from '../shared/schema.js'

export function toolCursor(tool: string, color: string) {
  if (tool === 'text') return 'text'
  const ink = isColor(color) ? color : '#f3cf62'
  const drawing = tool === 'wide'
    ? `<path d="m10 20 14-14a3 3 0 0 1 4 0l3 3a3 3 0 0 1 0 4L17 27Z" fill="#fffefa"/><path d="m10 20 7 7-5 5H4v-6Z" fill="${ink}"/><path d="m15 15 7 7"/><path d="M4 32h8" stroke="${ink}" stroke-width="3"/>`
    : tool === 'fine'
      ? `<path d="M9 23 26 6a2 2 0 0 1 3 0l1 1a2 2 0 0 1 0 3L13 27Z" fill="#fffefa"/><path d="m9 23 4 4-8 5Z" fill="${ink}"/><path d="m13 19 4 4"/><circle cx="5" cy="32" r="1.6" fill="${ink}"/>`
      : '<path d="m5 24 15-16a3 3 0 0 1 4 0l8 7a3 3 0 0 1 0 4L20 32H11Z" fill="#fffefa"/><path d="m5 24 7-7 12 11-4 4h-9Z" fill="#f09a91"/><path d="M4 33h24"/>'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="38" viewBox="0 0 38 38" data-tool="${tool}"><g stroke="#fffefa" stroke-width="3.5" stroke-linejoin="round">${drawing}</g><g stroke="#343a36" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round">${drawing}</g></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 5 32, text`
}
