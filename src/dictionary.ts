import { lookupEntry } from '../shared/dictionary.js'

interface Shard { entries: Record<string, [string, string, string?]>; forms: Record<string, string> }
export interface DictionaryEntry { word: string; phonetic: string; meaning: string; matchedFrom: string | null }
const loaders = import.meta.glob<{ default: Shard }>('./data/dictionary/[a-z].json')
const cache = new Map<string, Promise<Shard>>()

function loadShard(letter: string) {
  let cached = cache.get(letter)
  if (!cached) {
    const loader = loaders[`./data/dictionary/${letter}.json`]
    if (!loader) return Promise.reject(new Error('内置词典文件缺失，请重新下载完整的程序。'))
    cached = loader().then(module => module.default).catch(error => { cache.delete(letter); throw error })
    cache.set(letter, cached)
  }
  return cached
}
export const lookupWord = (word: string): Promise<DictionaryEntry | null> => lookupEntry(word, loadShard)
