import { test } from 'node:test'
import assert from 'node:assert/strict'
import { INK_THEMES, inkFill, contrast } from '../shared/ink-colors.js'

test('all preset and extreme custom fills preserve readable text in either theme', () => {
  for (const theme of ['light', 'dark']) {
    for (const color of ['#f3cf62', '#f09a91', '#a2cf95', '#94c9e9', '#c3a4df', '#000000', '#ffffff', '#0000ff', '#ff0000', '#00ff00']) {
      assert.ok(contrast(inkFill(color, theme), INK_THEMES[theme].text) >= 4.5, `${theme} ${color}`)
    }
  }
})
