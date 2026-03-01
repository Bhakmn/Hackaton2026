'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import styles from './page.module.css'
import PageTransitionWrapper from '@/components/PageTransitionWrapper/PageTransitionWrapper'
import BackButton from '@/components/BackButton/BackButton'
import SubmitButton from '@/components/SubmitButton/SubmitButton'

type Message = { role: 'user' | 'assistant'; content: string; error?: boolean }

export default function BuildPage() {
  const [phase, setPhase] = useState<'form' | 'building'>('form')
  const [requirements, setRequirements] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [port, setPort] = useState<number>(4000)
  const [messages, setMessages] = useState<Message[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [iframeKey, setIframeKey] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const sessionIdRef = useRef<string | null>(null)

  const isActive = requirements.trim().length > 10

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Live preview: refresh iframe every 2.5 s while Claude is writing ──────
  useEffect(() => {
    if (!chatLoading || phase !== 'building') return
    const id = setInterval(() => setIframeKey(k => k + 1), 2500)
    return () => clearInterval(id)
  }, [chatLoading, phase])

  // ── Heartbeat: ping every 10 s so the server knows we're alive ────────────
  useEffect(() => {
    const id = setInterval(() => {
      const sid = sessionIdRef.current
      if (!sid) return
      fetch('/api/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'keepalive', sessionId: sid }),
      }).catch(() => { /* ignore */ })
    }, 10_000)
    return () => clearInterval(id)
  }, [])

  // ── Cleanup helpers ────────────────────────────────────────────────────────
  const cleanup = useCallback(async (sid: string) => {
    sessionIdRef.current = null
    await fetch('/api/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cleanup', sessionId: sid }),
    }).catch(() => { /* fire-and-forget */ })
  }, [])

  useEffect(() => {
    return () => { if (sessionIdRef.current) cleanup(sessionIdRef.current) }
  }, [cleanup])

  useEffect(() => {
    const handler = () => {
      const sid = sessionIdRef.current
      if (!sid) return
      navigator.sendBeacon('/api/build',
        new Blob([JSON.stringify({ action: 'cleanup', sessionId: sid })], { type: 'application/json' }))
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  // ── Core streaming function ────────────────────────────────────────────────
  // Reads the SSE stream: shows Claude's description text live in chat,
  // while the iframe auto-refreshes to pick up the HTML being written to disk.
  async function streamChat(
    sid: string,
    message: string,
    historyForRequest: Message[],
    userMessages: Message[],
  ) {
    setMessages([...userMessages, { role: 'assistant', content: '' }])

    let streamedText = ''

    try {
      const res = await fetch('/api/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'chat', sessionId: sid, message, history: historyForRequest }),
      })

      if (!res.body) throw new Error('No response stream')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const ev = JSON.parse(line.slice(6)) as {
              done?: boolean; description?: string; error?: string; text?: string
            }

            if (ev.text) {
              // Live description text from Claude (pre-code-fence)
              streamedText += ev.text
              setMessages([
                ...userMessages,
                { role: 'assistant', content: streamedText.trim() },
              ])
            }

            if (ev.done) {
              // Replace streaming text with clean description
              setMessages([
                ...userMessages,
                { role: 'assistant', content: ev.description ?? (streamedText.trim() || 'Done!') },
              ])
              setIframeKey(k => k + 1)
            } else if (ev.error) {
              setMessages([
                ...userMessages,
                { role: 'assistant', content: ev.error, error: true },
              ])
              setIframeKey(k => k + 1)
            }
          } catch { /* malformed SSE event */ }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to reach Claude.'
      setMessages([...userMessages, { role: 'assistant', content: msg, error: true }])
    } finally {
      setChatLoading(false)
    }
  }

  // ── Start building ─────────────────────────────────────────────────────────
  async function handleStart() {
    if (!isActive) return
    const req = requirements.trim()

    let sid: string
    try {
      const res = await fetch('/api/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', requirements: req }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      sid = data.sessionId as string
      const assignedPort = (data.port as number) || 4000
      setPort(assignedPort)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to start build session.')
      return
    }

    setSessionId(sid)
    sessionIdRef.current = sid

    const initialMsg = `Build me a complete, beautiful website. Requirements: ${req}`
    const userMessages: Message[] = [{ role: 'user', content: initialMsg }]
    setMessages(userMessages)
    setPhase('building')
    setIframeKey(0)
    setChatLoading(true)

    await streamChat(sid, initialMsg, [], userMessages)
  }

  // ── Follow-up chat ─────────────────────────────────────────────────────────
  async function handleChatSend() {
    const text = chatInput.trim()
    if (!text || chatLoading || !sessionId) return

    setChatInput('')
    const userMessages: Message[] = [...messages, { role: 'user', content: text }]
    setMessages(userMessages)
    setChatLoading(true)

    await streamChat(sessionId, text, messages, userMessages)
  }

  function handleChatKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleChatSend()
    }
  }

  // ── Back to form ───────────────────────────────────────────────────────────
  function handleBack() {
    const sid = sessionIdRef.current
    if (sid) cleanup(sid)
    setPhase('form')
    setSessionId(null)
    setMessages([])
    setChatInput('')
    setIframeKey(0)
  }

  // ── Building view ──────────────────────────────────────────────────────────
  if (phase === 'building') {
    return (
      <div className={styles.previewPage}>
        {/* Chat panel */}
        <div className={styles.chatPanel}>
          <div className={styles.chatHeader}>
            <button className={styles.backBtn} onClick={handleBack}>← Back</button>
            <span className={styles.chatTitle}>Building</span>
          </div>

          <div className={styles.chatMessages}>
            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? styles.msgUser : styles.msgAssistant}>
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
              placeholder="Request changes… (Enter to send)"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={handleChatKey}
              rows={3}
              disabled={chatLoading}
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

        {/* Browser panel — shows localhost:4000, live-refreshes while Claude writes */}
        <div className={styles.browserPanel}>
          <div className={styles.topBar}>
            <div className={styles.dots}>
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
            </div>
            <span className={styles.urlLabel}>localhost:{port}</span>
            <a
              href={`http://localhost:${port}`}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.openLink}
              title="Open in new tab"
            >
              ↗
            </a>
          </div>

          {chatLoading && <div className={styles.loadingBar} />}

          <div className={styles.iframeWrap}>
            <iframe
              key={iframeKey}
              src={`http://localhost:${port}?_t=${iframeKey}`}
              className={styles.iframe}
              title="Your website preview"
              style={{ width: '100%', height: '100%' }}
            />
          </div>
        </div>
      </div>
    )
  }

  // ── Form view ──────────────────────────────────────────────────────────────
  return (
    <PageTransitionWrapper maxWidth="narrow">
      <BackButton />
      <div className={styles.card}>
        <p className={styles.eyebrow}>New Website</p>
        <h2 className={styles.heading}>Tell us about your site</h2>
        <p className={styles.sub}>
          Describe your requirements, goals, and any details we should know.
        </p>

        <div className={styles.inputWrap}>
          <textarea
            className={styles.textarea}
            placeholder="e.g. A portfolio site for a freelance photographer. Needs a gallery, contact form, and a clean minimal look. Colour palette: dark background with warm tones…"
            value={requirements}
            onChange={e => setRequirements(e.target.value)}
          />
          <p className={styles.charHint}>{requirements.length} characters</p>
        </div>

        <SubmitButton label="Start building →" active={isActive} onClick={handleStart} />
      </div>
    </PageTransitionWrapper>
  )
}
