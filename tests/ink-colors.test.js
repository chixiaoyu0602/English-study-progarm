import { test } from 'node:test'
import assert from 'node:assert/strict'
import { INK_THEMES, inkFill, contrast } from '../shared/ink-colors.js'

test('all preset and extreme custom fills preserve readable text in either theme', () => {
  for (const theme of ['light', 'dark']) {
    for (const color of ['#f3cf62', '#f09a91', '#a2cf95', '#94c9e9', '#c3a4df', '#000000', '#ffffff', '#0000ff', '#ff0000', '#00ff00']) {
      for (let depth = 0; depth < 8; depth++) assert.ok(contrast(inkFill(color, depth, theme), INK_THEMES[theme].text) >= 4.5, `${theme} ${color} depth ${depth}`)
    }
  }
})

test('successive yellow components have distinct shades in both themes', () => {
  for (const theme of ['light', 'dark']) {
    const shades = [0, 1, 2, 3].map(depth => inkFill('#f3cf62', depth, theme))
    assert.equal(new Set(shades).size, shades.length)
  }
})
