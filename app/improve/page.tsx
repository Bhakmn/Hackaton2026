'use client'

import { useState, useRef, useEffect } from 'react'
import styles from './page.module.css'
import PageTransitionWrapper from '@/components/PageTransitionWrapper/PageTransitionWrapper'
import BackButton from '@/components/BackButton/BackButton'
import SubmitButton from '@/components/SubmitButton/SubmitButton'

const DESKTOP_WIDTH = 1280

type Message = { role: 'user' | 'assistant'; content: string; error?: boolean }

export default function ImprovePage() {
  const [url, setUrl] = useState('')
  const [submittedUrl, setSubmittedUrl] = useState('')
  const [scale, setScale] = useState(1)
  const [loading, setLoading] = useState(true)
  const [messages, setMessages] = useState<Message[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const isActive = url.trim().length > 3

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      setScale(entry.contentRect.width / DESKTOP_WIDTH)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [submittedUrl])

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type === 'proxy-navigate') setLoading(true)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleAnalyse() {
    setSubmittedUrl(url.trim())
  }

  async function handleChatSend() {
    const text = chatInput.trim()
    if (!text || chatLoading) return

    setChatInput('')
    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setChatLoading(true)

    const controller = new AbortController()
    const abortTimer = setTimeout(() => controller.abort(), 65_000)

    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
        signal: controller.signal,
      })
      const data = await res.json()
      const content = data.response ?? data.error ?? 'No response.'
      setMessages((prev) => [...prev, { role: 'assistant', content, error: !!data.error }])
    } catch (err) {
      const timed = err instanceof Error && err.name === 'AbortError'
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: timed ? 'Request timed out. Try again.' : 'Failed to reach Claude.',
          error: true,
        },
      ])
    } finally {
      clearTimeout(abortTimer)
      setChatLoading(false)
    }
  }

  function handleChatKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleChatSend()
    }
  }

  if (submittedUrl) {
    const proxySrc = `/api/proxy?url=${encodeURIComponent(submittedUrl)}`

    return (
      <div className={styles.previewPage}>
        {/* ── Chat panel ── */}
        <div className={styles.chatPanel}>
          <div className={styles.chatHeader}>
            <button className={styles.backBtn} onClick={() => setSubmittedUrl('')}>
              ← Back
            </button>
            <span className={styles.chatTitle}>AI Chat</span>
          </div>

          <div className={styles.chatMessages}>
            {messages.length === 0 && (
              <p className={styles.chatEmpty}>Ask Claude anything about this website.</p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={m.role === 'user' ? styles.msgUser : styles.msgAssistant}
              >
                <pre className={m.error ? styles.msgError : styles.msgPre}>{m.content}</pre>
              </div>
            ))}
            {chatLoading && (
              <div className={styles.msgAssistant}>
                <span className={styles.chatSpinner} />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className={styles.chatInputWrap}>
            <textarea
              className={styles.chatInput}
              placeholder="Ask Claude…"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleChatKey}
              rows={3}
            />
            <button
              className={`${styles.sendBtn} ${chatInput.trim() && !chatLoading ? styles.sendActive : ''}`}
              onClick={handleChatSend}
              disabled={!chatInput.trim() || chatLoading}
            >
              Send
            </button>
          </div>
        </div>

        {/* ── Browser window ── */}
        <div className={styles.browserPanel}>
          <div className={styles.topBar}>
            <div className={styles.dots}>
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
            </div>
            <span className={styles.urlLabel}>{submittedUrl}</span>
            <a
              href={submittedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.openLink}
              title="Open in new tab"
            >
              ↗
            </a>
          </div>
          {loading && <div className={styles.loadingBar} />}

          <div className={styles.iframeWrap} ref={wrapRef}>
            <iframe
              src={proxySrc}
              className={styles.iframe}
              title="Website preview"
              sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
              onLoad={() => setLoading(false)}
              style={{
                width: DESKTOP_WIDTH,
                height: `${100 / scale}%`,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
              }}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <PageTransitionWrapper maxWidth="narrow">
      <BackButton />
      <div className={styles.card}>
        <p className={styles.eyebrow}>Improve Existing Site</p>
        <h2 className={styles.heading}>Share your website</h2>
        <p className={styles.sub}>Paste your current URL and we'll take a look.</p>

        <div className={styles.inputWrap}>
          <input
            className={styles.urlInput}
            type="url"
            placeholder="https://yourwebsite.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>

        <SubmitButton label="Analyse my website →" active={isActive} onClick={handleAnalyse} />
      </div>
    </PageTransitionWrapper>
  )
}
