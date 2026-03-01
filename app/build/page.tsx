'use client'

import { useState, useRef, useEffect, FormEvent } from 'react'
import styles from './page.module.css'
import BackButton from '@/components/BackButton/BackButton'

interface ChatMessage {
  id: number
  role: 'user' | 'assistant' | 'system'
  text: string
}

export default function BuildPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 0,
      role: 'system',
      text: 'Welcome to Ditto! Describe the website you want to build and I\'ll make it happen.',
    },
  ])
  const [input, setInput] = useState('')
  const [url, setUrl] = useState('')
  const [iframeUrl, setIframeUrl] = useState('')
  const [isBuilding, setIsBuilding] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const claudeOutputRef = useRef('')
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Fade-in on mount
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    requestAnimationFrame(() => el.classList.add(styles.visible))
  }, [])

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Cleanup on unmount – kill session
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      fetch('/api/build', { method: 'DELETE' }).catch(() => {})
    }
  }, [])

  function addMessage(role: ChatMessage['role'], text: string): number {
    const id = Date.now() + Math.random()
    setMessages(prev => [...prev, { id, role, text }])
    return id
  }

  // ── SSE build stream ──
  async function startBuild(prompt: string) {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('/api/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, sessionId }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        addMessage('system', `Server error: ${res.status}`)
        setIsBuilding(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let claudeMsgId: number | null = null
      claudeOutputRef.current = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''

        for (const part of parts) {
          for (const line of part.split('\n')) {
            if (!line.startsWith('data: ')) continue

            try {
              const data = JSON.parse(line.slice(6))

              switch (data.type) {
                case 'status':
                  addMessage('system', data.message)
                  break

                case 'session':
                  setSessionId(data.sessionId)
                  break

                case 'dev-ready':
                  setIframeUrl(data.url)
                  setUrl(data.url)
                  break

                case 'claude-output': {
                  if (!claudeMsgId) {
                    claudeMsgId = Date.now() + Math.random()
                    claudeOutputRef.current = data.output
                    setMessages(prev => [
                      ...prev,
                      { id: claudeMsgId!, role: 'assistant', text: data.output },
                    ])
                  } else {
                    claudeOutputRef.current += data.output
                    const id = claudeMsgId
                    setMessages(prev =>
                      prev.map(m => (m.id === id ? { ...m, text: claudeOutputRef.current } : m))
                    )
                  }
                  break
                }

                case 'claude-done':
                  addMessage('system', data.message)
                  claudeMsgId = null
                  setIsBuilding(false)
                  break

                case 'error':
                  addMessage('system', `Error: ${data.message}`)
                  setIsBuilding(false)
                  break

                case 'done':
                  setIsBuilding(false)
                  break
              }
            } catch {
              // skip malformed JSON
            }
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        addMessage('system', `Connection lost: ${err.message}`)
      }
    } finally {
      setIsBuilding(false)
    }
  }

  function handleSend(e: FormEvent) {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed || isBuilding) return

    addMessage('user', trimmed)
    setInput('')
    setIsBuilding(true)
    startBuild(trimmed)
  }

  function handleLoadUrl(e: FormEvent) {
    e.preventDefault()
    let finalUrl = url.trim()
    if (!finalUrl) return
    if (!/^https?:\/\//i.test(finalUrl)) finalUrl = 'https://' + finalUrl
    setIframeUrl(finalUrl)
  }

  function refreshPreview() {
    if (iframeRef.current && iframeUrl) {
      iframeRef.current.src = iframeUrl
    }
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
                msg.role === 'user'
                  ? styles.userMsg
                  : msg.role === 'system'
                    ? styles.systemMsg
                    : styles.assistantMsg
              }`}
            >
              {msg.role === 'system' ? (
                <div className={styles.systemBubble}>{msg.text}</div>
              ) : (
                <div className={styles.msgBubble}>{msg.text}</div>
              )}
            </div>
          ))}

          {isBuilding && (
            <div className={`${styles.message} ${styles.systemMsg}`}>
              <div className={styles.systemBubble}>
                <span className={styles.buildingDots}>
                  <span>●</span>
                  <span>●</span>
                  <span>●</span>
                </span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form className={styles.chatInputArea} onSubmit={handleSend}>
          <textarea
            className={styles.chatInput}
            placeholder={isBuilding ? 'Building in progress...' : 'Describe what you want to build...'}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend(e)
              }
            }}
            rows={1}
            disabled={isBuilding}
          />
          <button
            type="submit"
            className={styles.sendBtn}
            disabled={!input.trim() || isBuilding}
          >
            ↑
          </button>
        </form>
      </div>

      {/* ── Right: Preview Panel ── */}
      <div className={styles.previewPanel}>
        <div className={styles.urlBar}>
          <form className={styles.urlForm} onSubmit={handleLoadUrl}>
            <div className={styles.urlInputWrap}>
              <span className={styles.urlIcon}>⌐</span>
              <input
                type="text"
                className={styles.urlInput}
                placeholder="URL appears when dev server starts..."
                value={url}
                onChange={e => setUrl(e.target.value)}
              />
            </div>
            <button type="submit" className={styles.goBtn} disabled={!url.trim()}>
              Go
            </button>
          </form>
          {iframeUrl && (
            <button type="button" className={styles.refreshBtn} onClick={refreshPreview}>
              ↻
            </button>
          )}
        </div>

        <div className={styles.iframeWrap}>
          {iframeUrl ? (
            <iframe
              ref={iframeRef}
              src={iframeUrl}
              className={styles.iframe}
              title="Website preview"
            />
          ) : (
            <div className={styles.emptyPreview}>
              <div className={styles.emptyIcon}>◎</div>
              <p className={styles.emptyText}>
                {isBuilding
                  ? 'Setting up your project...'
                  : 'Send a message to start building your website'}
              </p>
              <p className={styles.emptyHint}>
                Your site will appear here once the dev server starts
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
