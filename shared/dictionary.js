export function normalizeWord(input) {
  if (typeof input !== 'string') return null
  const word = input.normalize('NFKC').replace(/[‘’]/g, "'").trim().toLowerCase()
    .replace(/^[\s"'“”.,!?;:()[\]{}]+|[\s"'“”.,!?;:()[\]{}]+$/g, '')
  return word.length <= 80 && /^[a-z]+(?:['-][a-z]+)*$/.test(word) ? word : null
}

// A supplied loader keeps the same lookup logic usable in the browser and in tests.
export async function lookupEntry(input, loadShard) {
  const query = normalizeWord(input)
  if (!query) return null
  const shard = await loadShard(query[0])
  let word = query
  let entry = Object.hasOwn(shard.entries, word) ? shard.entries[word] : null
  if (!entry && Object.hasOwn(shard.forms, word)) {
    word = shard.forms[word]
    const base = await loadShard(word[0])
    entry = Object.hasOwn(base.entries, word) ? base.entries[word] : null
  }
  if (!entry) return null
  const [phonetic, meaning, lemma] = entry
  let fullMeaning = meaning
  if (lemma && lemma !== word) {
    const base = await loadShard(lemma[0])
    const root = Object.hasOwn(base.entries, lemma) ? base.entries[lemma] : null
    if (root) fullMeaning += `\n\n原形 ${lemma}：\n${root[1]}`
  }
  return { word, phonetic, meaning: fullMeaning, matchedFrom: query !== word ? query : null }
}
