import { useEffect, useState } from 'react'
import { BookPlus, Check, LoaderCircle, X } from 'lucide-react'
import { lookupWord, type DictionaryEntry } from './dictionary'
import type { WordRequest } from './reading'
import type { WordSource } from './model'

export default function DictionaryCard({ request, savedWords, onSave, onClose }: {
  request: WordRequest; savedWords: Set<string>;
  onSave: (entry: DictionaryEntry, source: WordSource | null) => void; onClose: () => void;
}) {
  const [result, setResult] = useState<DictionaryEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    setLoading(true); setError(''); setResult(null)
    lookupWord(request.query).then(entry => { if (active) setResult(entry) })
      .catch(() => { if (active) setError('词典暂时未能打开，请重试。') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [request.query, retry])
  return <section className="dictionary-card" role="dialog" aria-modal="false" aria-labelledby="dictionary-heading">
    <div className="dictionary-top"><span>离线英汉词典</span><button className="icon-button" aria-label="关闭查词" onClick={onClose}><X size={17} /></button></div>
    <h2 id="dictionary-heading">{result?.word || request.query}</h2>
    {loading ? <div className="dictionary-loading" role="status"><LoaderCircle size={17} className="spin" /> 正在查词…</div> : error ? <div role="alert"><p>{error}</p><button className="secondary-button" onClick={() => setRetry(value => value + 1)}>重新打开词典</button></div> : !result ? <p className="dictionary-missing">离线词典暂未收录这个词。请检查拼写，或选择一个完整的英文单词。</p> : <>
      <div className="dictionary-scroll">
      {result.phonetic && <p className="phonetic">/{result.phonetic}/</p>}
      {result.matchedFrom && <p className="dictionary-match">由 {result.matchedFrom} 匹配到词形 {result.word}</p>}
      <div className="dictionary-meaning">{result.meaning}</div>
      {request.source?.quote && <blockquote className="dictionary-source"><span>文章中的原句</span>{request.source.quote}</blockquote>}
      </div>
      <button className="primary-button save-word" disabled={savedWords.has(result.word)} onClick={() => onSave(result, request.source)}>{savedWords.has(result.word) ? <Check size={16} /> : <BookPlus size={16} />}{savedWords.has(result.word) ? '已在单词本' : '加入单词本'}</button>
    </>}
    <p className="dictionary-credit">释义来自 ECDICT · 本机查询</p>
  </section>
}
