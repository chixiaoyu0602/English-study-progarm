import { useState } from 'react'
import { ArrowUpRight, BookOpen, Search, Trash2 } from 'lucide-react'
import type { Note, WordCard } from './model'
import { normalizeWord } from '../shared/dictionary.js'

export default function Wordbook({ words, notes, onLookup, onRemove, onOpenNote }: {
  words: WordCard[]; notes: Note[]; onLookup: (word: string) => void;
  onRemove: (word: string) => void; onOpenNote: (id: string) => void;
}) {
  const [query, setQuery] = useState('')
  const visible = words.filter(entry => `${entry.word}\n${entry.meaning}`.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => b.addedAt - a.addedAt)
  const dictionaryWord = normalizeWord(query)
  return <section className="wordbook-scroll" aria-label="单词本">
    <div className="wordbook-page">
      <div className="wordbook-heading"><div className="wordbook-symbol"><BookOpen size={25} strokeWidth={1.5} /></div><div><h1>单词本 <span>{words.length}</span></h1><p>把文章里的生词，留在原句里。</p></div></div>
      <form className="wordbook-search" onSubmit={event => { event.preventDefault(); if (dictionaryWord) onLookup(dictionaryWord) }}><Search size={17} /><input aria-label="搜索单词或中文释义" placeholder="搜索单词或释义，输入英文按回车查词" value={query} maxLength={100} onChange={event => setQuery(event.target.value)} /><button disabled={!dictionaryWord} type="submit">查词</button></form>
      {!visible.length ? <div className="wordbook-empty"><BookOpen size={36} strokeWidth={1.2} /><h2>{query ? '单词本里还没有这个词' : '从文章里的第一个生词开始'}</h2><p>{query ? '可以输入英文并点击「查词」，查看释义后收藏。' : '在文章中右键单词，查看释义，再点「加入单词本」。'}</p></div> : <div className="word-list">
        {visible.map(entry => <article className="word-card" key={entry.word} aria-label={`单词 ${entry.word}`}>
          <div className="word-card-heading"><div><h2>{entry.word}</h2>{entry.phonetic && <span className="phonetic">/{entry.phonetic}/</span>}</div><button className="icon-button remove-word" aria-label={`移出单词本 ${entry.word}`} title="移出单词本" onClick={() => onRemove(entry.word)}><Trash2 size={16} /></button></div>
          <p className="word-meaning">{entry.meaning}</p>
          {entry.source && <div className="word-source">
            {entry.source.quote && <blockquote>{entry.source.quote}</blockquote>}
            <div><span>来自《{entry.source.title || '未命名笔记'}》</span>{notes.some(note => note.id === entry.source?.noteId) ? <button aria-label={`回到原文 ${entry.word}`} onClick={() => onOpenNote(entry.source!.noteId!)}>回到原文 <ArrowUpRight size={13} /></button> : <span className="source-removed">原文已移除</span>}</div>
          </div>}
        </article>)}
      </div>}
      <p className="wordbook-footnote">释义来自内置英汉词典，无需联网。单词本随笔记一起自动保存和备份。</p>
    </div>
  </section>
}
