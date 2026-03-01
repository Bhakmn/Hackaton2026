'use client'

import { useState, useRef, useEffect, FormEvent } from 'react'
import styles from './page.module.css'
import BackButton from '@/components/BackButton/BackButton'

interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  text: string
}

export default function BuildPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 0,
      role: 'assistant',
      text: 'Welcome to Ditto! Describe the website you want to build, and I\'ll help you create it. You can also enter a URL on the right to preview any site.',
    },
  ])
  const [input, setInput] = useState('')
  const [url, setUrl] = useState('')
  const [loadedUrl, setLoadedUrl] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    requestAnimationFrame(() => {
      el.classList.add(styles.visible)
    })
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleSend(e: FormEvent) {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed) return

    const userMsg: ChatMessage = {
      id: Date.now(),
      role: 'user',
      text: trimmed,
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')

    // Simulated assistant response for now
    setTimeout(() => {
      const assistantMsg: ChatMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        text: `Got it! I'll work on that. Here's what I understand:\n\n"${trimmed}"\n\nThis feature will be connected to the build engine soon.`,
      }
      setMessages(prev => [...prev, assistantMsg])
    }, 800)
  }

  function handleLoadUrl(e: FormEvent) {
    e.preventDefault()
    let finalUrl = url.trim()
    if (!finalUrl) return
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = 'https://' + finalUrl
    }
    setLoadedUrl(finalUrl)
  }

  return (
    <div ref={wrapperRef} className={styles.workspace}>
      {/* ── Left: Chat Panel ── */}
      <div className={styles.chatPanel}>
        <div className={styles.chatHeader}>
          <BackButton />
          <span className={styles.chatTitle}>Ditto Builder</span>
        </div>

        <div className={styles.chatMessages}>
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`${styles.message} ${
                msg.role === 'user' ? styles.userMsg : styles.assistantMsg
              }`}
            >
              <div className={styles.msgBubble}>
                {msg.text}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <form className={styles.chatInputArea} onSubmit={handleSend}>
          <textarea
            className={styles.chatInput}
            placeholder="Describe what you want to build..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend(e)
              }
            }}
            rows={1}
          />
          <button
            type="submit"
            className={styles.sendBtn}
            disabled={!input.trim()}
          >
            ↑
          </button>
        </form>
      </div>

      {/* ── Right: Preview Panel ── */}
      <div className={styles.previewPanel}>
        <form className={styles.urlBar} onSubmit={handleLoadUrl}>
          <div className={styles.urlInputWrap}>
            <span className={styles.urlIcon}>⌐</span>
            <input
              type="text"
              className={styles.urlInput}
              placeholder="Enter a URL to preview (e.g. google.com)"
              value={url}
              onChange={e => setUrl(e.target.value)}
            />
          </div>
          <button
            type="submit"
            className={styles.goBtn}
            disabled={!url.trim()}
          >
            Go
          </button>
        </form>

        <div className={styles.iframeWrap}>
          {loadedUrl ? (
            <iframe
              src={loadedUrl}
              className={styles.iframe}
              title="Website preview"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          ) : (
            <div className={styles.emptyPreview}>
              <div className={styles.emptyIcon}>◎</div>
              <p className={styles.emptyText}>Enter a URL above to preview a website</p>
              <p className={styles.emptyHint}>
                Soon this will render your site live as we build it
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
