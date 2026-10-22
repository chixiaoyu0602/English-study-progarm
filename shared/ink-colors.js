export const INK_THEMES = {
  light: { paper: '#fffefa', text: '#343a36' },
  dark: { paper: '#242823', text: '#e0e3d9' },
}

const rgb = hex => hex.slice(1).match(/../g).map(part => parseInt(part, 16))
function luminance(hex) {
  return rgb(hex).reduce((sum, channel, index) => {
    const s = channel / 255
    return sum + (s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][index]
  }, 0)
}
export function contrast(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (high + .05) / (low + .05)
}
function mix(color, paper, strength) {
  const base = rgb(paper)
  return '#' + rgb(color).map((channel, i) => Math.round(channel * strength + base[i] * (1 - strength)).toString(16).padStart(2, '0')).join('')
}

const cache = new Map()
export function inkFill(color, theme) {
  const key = `${color}:${theme}`
  if (cache.has(key)) return cache.get(key)
  const { paper, text } = INK_THEMES[theme]
  let maximum = 1
  // Custom black/white colours must also keep the article text readable.
  while (maximum > 0 && contrast(mix(color, paper, maximum), text) < 4.6) maximum = Math.max(0, maximum - .01)
  const fill = mix(color, paper, maximum * .45)
  if (cache.size > 2000) cache.clear()
  cache.set(key, fill)
  return fill
}

export function inkBackground(wide, fine, theme) {
  const lines = fine.map((layer, index) => {
    const bottom = 1 + (fine.length - index - 1) * 4
    return `linear-gradient(transparent calc(100% - ${bottom + 3}px), ${layer.color} calc(100% - ${bottom + 3}px), ${layer.color} calc(100% - ${bottom}px), transparent calc(100% - ${bottom}px))`
  })
  if (wide) {
    const fill = inkFill(wide.color, theme)
    lines.push(`linear-gradient(${fill}, ${fill})`)
  }
  return lines.join(', ') || 'none'
}
