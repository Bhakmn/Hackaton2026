'use client'

import { useState, useRef, useEffect, FormEvent } from 'react'
import styles from './page.module.css'
import PageTransitionWrapper from '@/components/PageTransitionWrapper/PageTransitionWrapper'
import BackButton from '@/components/BackButton/BackButton'
import SubmitButton from '@/components/SubmitButton/SubmitButton'

interface ChatMessage {
  id: number
  role: 'user' | 'assistant' | 'system'
  text: string
}

export default function ImprovePage() {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [phase, setPhase] = useState<'input' | 'building'>('input')

  // Chat + build state
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
  const [iframeUrl, setIframeUrl] = useState('')
  const [isBuilding, setIsBuilding] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const claudeOutputRef = useRef('')
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const isActive = url.trim().length > 3

  // Fade in workspace
  useEffect(() => {
    if (phase === 'building' && wrapperRef.current) {
      requestAnimationFrame(() => wrapperRef.current?.classList.add(styles.visible))
    }
  }, [phase])

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      fetch('/api/improve', { method: 'DELETE' }).catch(() => {})
    }
  }, [])

  function addMessage(role: ChatMessage['role'], text: string): number {
    const id = Date.now() + Math.random()
    setMessages(prev => [...prev, { id, role, text }])
    return id
  }

  // ── SSE build stream ──
  async function startBuild(payload: { url?: string; prompt?: string }) {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('/api/improve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, sessionId }),
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
                  setPreviewUrl(data.url)
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

  function handleAnalyse() {
    if (!isActive) return

    let finalUrl = url.trim()
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = 'https://' + finalUrl
    }

    setError('')
    setPhase('building')
    setIsBuilding(true)
    setMessages([
      { id: 0, role: 'system', text: `Analysing ${finalUrl}...` },
    ])

    startBuild({ url: finalUrl })
  }

  function handleSend(e: FormEvent) {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed || isBuilding) return

    addMessage('user', trimmed)
    setInput('')
    setIsBuilding(true)
    startBuild({ prompt: trimmed })
  }

  function handleLoadUrl(e: FormEvent) {
    e.preventDefault()
    let finalUrl = previewUrl.trim()
    if (!finalUrl) return
    if (!/^https?:\/\//i.test(finalUrl)) finalUrl = 'https://' + finalUrl
    setIframeUrl(finalUrl)
  }

  function refreshPreview() {
    if (iframeRef.current && iframeUrl) {
      iframeRef.current.src = iframeUrl
    }
  }

  // ── Phase 1: URL input form ──
  if (phase === 'input') {
    return (
      <PageTransitionWrapper maxWidth="narrow">
        <BackButton />
        <div className={styles.card}>
          <p className={styles.eyebrow}>Improve Existing Site</p>
          <h2 className={styles.heading}>Share your website</h2>
          <p className={styles.sub}>Paste your current URL and we&apos;ll rebuild it with AI.</p>

          <div className={styles.inputWrap}>
            <input
              className={styles.domainInput}
              type="url"
              placeholder="https://yourwebsite.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleAnalyse()
                }
              }}
            />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <SubmitButton
            label="Analyse my website"
            active={isActive}
            onClick={handleAnalyse}
          />
        </div>
      </PageTransitionWrapper>
    )
  }

  // ── Phase 2: Chat + Preview ──
  return (
    <div ref={wrapperRef} className={styles.workspace}>
      {/* ── Left: Chat Panel ── */}
      <div className={styles.chatPanel}>
        <div className={styles.chatHeader}>
          <BackButton />
          <span className={styles.chatTitle}>Ditto Improver</span>
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
            placeholder={isBuilding ? 'Building in progress...' : 'Send a follow-up instruction...'}
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
                value={previewUrl}
                onChange={e => setPreviewUrl(e.target.value)}
              />
            </div>
            <button type="submit" className={styles.goBtn} disabled={!previewUrl.trim()}>
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
                  : 'Your rebuilt site will appear here'}
              </p>
              <p className={styles.emptyHint}>
                The preview will load once the dev server starts
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
