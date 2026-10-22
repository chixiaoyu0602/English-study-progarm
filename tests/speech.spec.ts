import { test, expect } from '@playwright/test'
import { fresh } from './helpers'

async function savePuma(page: import('@playwright/test').Page) {
  await fresh(page)
  await page.getByRole('button', { name: '打开单词本' }).click()
  const input = page.getByRole('textbox', { name: '搜索单词或中文释义' })
  await input.fill('puma'); await input.press('Enter')
  await expect(page.getByRole('dialog', { name: 'puma' })).toContainText('美洲狮')
  await page.getByRole('button', { name: '加入单词本', exact: true }).click()
  await page.getByRole('button', { name: '关闭查词' }).click()
}

test('wordbook speech uses only local English voices, labels browser reading and can stop', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: class { constructor(public text: string) {} } })
    const local = { name: 'Local English', lang: 'en-GB', localService: true }
    const remote = { name: 'Remote English', lang: 'en-US', localService: false }
    Object.defineProperty(window, 'speechSynthesis', { value: {
      getVoices: () => [remote, local], cancel: () => {},
      speak: (utterance: SpeechSynthesisUtterance) => {
        if (!utterance.voice?.localService) throw new Error('Remote voice used')
        setTimeout(() => utterance.onend?.call(utterance, {} as SpeechSynthesisEvent), 350)
      },
    } })
  })
  await savePuma(page)
  await expect(page.locator('.word-card .phonetic')).toHaveText('/ˈpjuːmə/')
  await page.getByRole('button', { name: '播放发音 puma' }).click()
  await expect(page.locator('.speech-status')).toContainText('系统读音')
  await page.getByRole('button', { name: '播放发音 puma' }).click()
  await page.getByRole('button', { name: '停止发音 puma' }).click()
  await expect(page.getByRole('button', { name: '播放发音 puma' })).toBeVisible()
  await expect(page.locator('.speech-status')).toHaveCount(0)
})

test('remote-only voices are refused with a useful local-voice message', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', { value: {
      getVoices: () => [{ name: 'Remote', lang: 'en-US', localService: false }], cancel: () => {},
      speak: () => { throw new Error('Must never invoke a remote voice') },
    } })
  })
  await savePuma(page)
  await page.getByRole('button', { name: '播放发音 puma' }).click()
  await expect(page.getByRole('alert')).toContainText('没有可用的本地英语语音')
  await expect(page.getByRole('button', { name: '播放发音 puma' })).toBeEnabled()
})
