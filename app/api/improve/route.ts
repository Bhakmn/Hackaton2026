import { NextRequest, NextResponse } from 'next/server'
import { spawn, ChildProcess, exec, execSync } from 'child_process'
import path from 'path'
import fs from 'fs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const SESSIONS_DIR = path.join(process.cwd(), 'sessions')
const REPO_URL = 'https://github.com/Shi1f2/ditto_website_cloning_2.git'
const DEV_PORT = 3101
const CLAUDE_TIMEOUT_MS = 5 * 60 * 1000
const HEARTBEAT_INTERVAL_MS = 10_000
const SCRAPER_BASE_URL = 'http://localhost:8000'

// ── Persist process state across Next.js hot reloads ──
const g = global as Record<string, unknown>
if (!g.__dittoImproveSession) {
  g.__dittoImproveSession = null
}

interface SessionState {
  id: string
  dir: string
  repoDir: string
  devProcess: ChildProcess | null
  devPid: number | null
  claudeProcess: ChildProcess | null
}

function getSession(): SessionState | null {
  return g.__dittoImproveSession as SessionState | null
}

function setSession(s: SessionState | null) {
  g.__dittoImproveSession = s
}

// ── Strip ANSI escape codes ──
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
}

// ── Safe kill: only kills the specific PID ──
function safeKillPid(pid: number, label: string) {
  console.log(`[IMPROVE] Safe-killing ${label} (PID: ${pid})`)
  try {
    process.kill(pid, 'SIGTERM')
  } catch {
    console.log(`[IMPROVE]   PID ${pid} already dead`)
  }
}

// ── Kill only processes listening on a port (excluding our own PID + parent) ──
async function killPortProcesses(port: number) {
  const myPid = process.pid
  const parentPid = process.ppid
  return new Promise<void>((resolve) => {
    exec(`lsof -ti:${port} 2>/dev/null`, (err, stdout) => {
      const pids = (stdout || '').trim().split('\n').filter(Boolean)
      const safePids = pids.filter(
        (p) => p !== String(myPid) && p !== String(parentPid)
      )
      if (safePids.length > 0) {
        exec(`kill -9 ${safePids.join(' ')} 2>/dev/null`, () => {
          setTimeout(resolve, 500)
        })
      } else {
        resolve()
      }
    })
  })
}

// ── Kill session ──
async function killActiveSession(fullCleanup: boolean) {
  const session = getSession()
  if (!session) return

  if (session.claudeProcess && !session.claudeProcess.killed) {
    try { session.claudeProcess.kill('SIGTERM') } catch { /* */ }
  }

  if (fullCleanup) {
    if (session.devPid) safeKillPid(session.devPid, 'dev-server')
    await killPortProcesses(DEV_PORT)
  }

  setSession(null)
}

// ── Resolve command path using login shell ──
function resolveCommandPath(cmd: string): string | null {
  try {
    const result = execSync(`/bin/zsh -l -c "which ${cmd}" 2>/dev/null`, {
      encoding: 'utf-8',
      timeout: 10000,
    }).trim()
    if (result) return result
  } catch { /* */ }

  try {
    const result = execSync(`which ${cmd} 2>/dev/null`, {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim()
    if (result) return result
  } catch { /* */ }

  const commonPaths = [
    `/usr/local/bin/${cmd}`,
    `/opt/homebrew/bin/${cmd}`,
    `${process.env.HOME}/.npm-global/bin/${cmd}`,
    `${process.env.HOME}/.local/bin/${cmd}`,
  ]
  for (const p of commonPaths) {
    if (fs.existsSync(p)) return p
  }
  return null
}

// ── Run a command and wait for exit ──
function runCommand(
  cmd: string,
  args: string[],
  cwd: string,
  sendEvent: (type: string, data: Record<string, unknown>) => void,
  label: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[IMPROVE][${label}] ▶ ${cmd} ${args.join(' ')}`)
    const proc = spawn(cmd, args, { cwd, shell: true })

    proc.stdout?.on('data', (data: Buffer) => {
      const output = data.toString().trim()
      if (output) {
        console.log(`[IMPROVE][${label}] stdout: ${output}`)
        sendEvent('log', { output, label })
      }
    })

    proc.stderr?.on('data', (data: Buffer) => {
      const output = data.toString().trim()
      if (output) console.log(`[IMPROVE][${label}] stderr: ${output}`)
    })

    proc.on('close', (code: number | null) => {
      console.log(`[IMPROVE][${label}] ✓ Exit code: ${code}`)
      if (code === 0) resolve()
      else reject(new Error(`${cmd} exited with code ${code}`))
    })

    proc.on('error', (err: Error) => {
      console.error(`[IMPROVE][${label}] ✗ Error:`, err.message)
      reject(err)
    })
  })
}

// ══════════════════════════════════════════════════════
// POST: Start or continue an improve session
// ══════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { url, prompt, sessionId: existingSessionId } = body

  console.log(`\n[IMPROVE] ════════════════════════════════════════`)
  console.log(`[IMPROVE] Request at ${new Date().toISOString()}`)
  console.log(`[IMPROVE] URL: "${url || 'N/A'}" | Prompt: "${(prompt || '').substring(0, 80)}"`)
  console.log(`[IMPROVE] Session: ${existingSessionId || 'new'}`)

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      function sendEvent(type: string, data: Record<string, unknown>) {
        try {
          const payload = JSON.stringify({ type, ...data })
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`))
          console.log(`[IMPROVE][EVENT] → ${type}: ${JSON.stringify(data).substring(0, 200)}`)
        } catch (e) {
          console.error(`[IMPROVE][EVENT] Failed:`, e)
        }
      }

      try {
        let sessionId: string
        let repoDir: string
        let claudePrompt: string
        const existingSession = getSession()

        if (
          existingSessionId &&
          existingSession &&
          existingSession.id === existingSessionId
        ) {
          // ════ FOLLOW-UP PROMPT ════
          sessionId = existingSessionId
          repoDir = existingSession.repoDir
          claudePrompt = prompt || ''
          console.log(`[IMPROVE] Reusing session: ${sessionId}`)
          sendEvent('status', { message: 'Using existing session...' })

          if (existingSession.claudeProcess && !existingSession.claudeProcess.killed) {
            try { existingSession.claudeProcess.kill('SIGTERM') } catch { /* */ }
          }
        } else {
          // ════ BRAND NEW SESSION ════
          await killActiveSession(true)

          sessionId = `improve_${Date.now()}`
          console.log(`[IMPROVE] New session: ${sessionId}`)

          // Step 1: Sessions directory
          if (!fs.existsSync(SESSIONS_DIR)) {
            fs.mkdirSync(SESSIONS_DIR, { recursive: true })
          }
          const sessionDir = path.join(SESSIONS_DIR, sessionId)
          fs.mkdirSync(sessionDir, { recursive: true })
          sendEvent('status', { message: 'Setting up build session...' })

          // Step 2: Clone
          sendEvent('status', { message: 'Cloning template repository...' })
          await runCommand('git', ['clone', REPO_URL], sessionDir, sendEvent, 'CLONE')

          // Find the cloned directory (robust detection)
          const entries = fs.readdirSync(sessionDir).filter(d =>
            fs.statSync(path.join(sessionDir, d)).isDirectory()
          )
          if (entries.length === 0) {
            throw new Error('Clone failed — no directory created')
          }
          repoDir = path.join(sessionDir, entries[0])
          sendEvent('status', { message: 'Repository cloned!' })

          // Step 3: npm install + scraper call IN PARALLEL
          sendEvent('status', { message: 'Installing dependencies & crawling website...' })

          const scraperPromise = (async () => {
            const scraperUrl = `${SCRAPER_BASE_URL}/crawl?url=${encodeURIComponent(url)}`
            console.log(`[IMPROVE][SCRAPER] Calling: ${scraperUrl}`)
            const scraperController = new AbortController()
            const scraperTimeout = setTimeout(() => scraperController.abort(), 180000)
            try {
              const res = await fetch(scraperUrl, { signal: scraperController.signal })
              clearTimeout(scraperTimeout)
              if (!res.ok) {
                const errText = await res.text().catch(() => '')
                throw new Error(`Scraper returned ${res.status}: ${errText}`)
              }
              return await res.json()
            } catch (err: unknown) {
              clearTimeout(scraperTimeout)
              if (err instanceof Error && err.name === 'AbortError') {
                throw new Error('Website crawling timed out (3 min limit)')
              }
              throw err
            }
          })()

          const [, crawlData] = await Promise.all([
            runCommand('npm', ['install'], repoDir, sendEvent, 'INSTALL'),
            scraperPromise,
          ])

          // Save crawl JSON to the repo
          const crawlJsonPath = path.join(repoDir, 'crawl_data.json')
          fs.writeFileSync(crawlJsonPath, JSON.stringify(crawlData, null, 2), 'utf-8')
          console.log(`[IMPROVE] Crawl data saved: ${crawlJsonPath}`)
          sendEvent('status', { message: `Crawled ${crawlData.total_pages || 0} pages successfully!` })

          // Step 4: Start dev server
          sendEvent('status', { message: `Starting dev server on port ${DEV_PORT}...` })
          await killPortProcesses(DEV_PORT)

          const devProcess = spawn(
            'npm',
            ['run', 'dev', '--', '--port', String(DEV_PORT)],
            {
              cwd: repoDir,
              env: { ...process.env, PORT: String(DEV_PORT) },
              shell: true,
              detached: true,
            }
          )
          devProcess.unref()

          const devPid = devProcess.pid || null
          console.log(`[IMPROVE][DEV] PID: ${devPid}`)

          setSession({
            id: sessionId,
            dir: sessionDir,
            repoDir,
            devProcess,
            devPid,
            claudeProcess: null,
          })

          // Wait for dev server readiness
          let devReady = false
          let devFailed = false
          await new Promise<void>((resolve) => {
            const timeout = setTimeout(() => {
              if (!devReady && !devFailed) { devReady = true; resolve() }
            }, 45000)

            const check = () => (data: Buffer) => {
              const text = data.toString()
              console.log(`[IMPROVE][DEV] ${text.trim()}`)
              if (text.includes('EADDRINUSE') || text.includes('Failed to start')) {
                devFailed = true; clearTimeout(timeout); resolve(); return
              }
              if (!devReady && !devFailed &&
                (text.includes('localhost') || text.includes('Local:') ||
                  text.includes('ready') || text.includes('compiled') ||
                  text.includes('VITE') || text.includes('listening'))
              ) {
                devReady = true; clearTimeout(timeout); setTimeout(resolve, 2000)
              }
            }
            devProcess.stdout?.on('data', check())
            devProcess.stderr?.on('data', check())
            devProcess.on('error', () => { devFailed = true; clearTimeout(timeout); resolve() })
            devProcess.on('close', () => { clearTimeout(timeout); if (!devReady) { devFailed = true; resolve() } })
          })

          if (devFailed) {
            sendEvent('error', { message: `Dev server failed on port ${DEV_PORT}` })
          } else {
            sendEvent('dev-ready', { port: DEV_PORT, url: `http://localhost:${DEV_PORT}` })
            sendEvent('status', { message: `Dev server running at http://localhost:${DEV_PORT}` })
          }

          // Auto-generated prompt for initial crawl-based generation
          claudePrompt = `"./crawl_data.json" using this json file do the following instruction in the claude.md to generate a website`
        }

        // ══════════════════════════════════════════════
        // Run Claude Code with --output-format stream-json
        // ══════════════════════════════════════════════
        console.log(`[IMPROVE] ── Starting Claude Code ──`)
        console.log(`[IMPROVE]   CWD: ${repoDir}`)
        console.log(`[IMPROVE]   Prompt: ${claudePrompt.substring(0, 120)}`)

        sendEvent('status', { message: 'Locating Claude Code CLI...' })
        const claudePath = resolveCommandPath('claude')
        if (!claudePath) {
          sendEvent('error', { message: "Claude CLI not found. Install with: npm i -g @anthropic-ai/claude-code" })
          controller.close()
          return
        }
        sendEvent('status', { message: `Claude CLI: ${claudePath}` })

        sendEvent('status', { message: 'Starting Claude Code session...' })
        sendEvent('session', { sessionId })

        const claudeArgs = [
          '-p', claudePrompt,
          '--dangerously-skip-permissions',
          '--output-format', 'stream-json',
          '--verbose',
        ]

        console.log(`[IMPROVE][CLAUDE] Spawning: ${claudePath}`)

        const claudeProcess = spawn(claudePath, claudeArgs, {
          cwd: repoDir,
          env: { ...process.env },
          stdio: ['ignore', 'pipe', 'pipe'],
        })

        console.log(`[IMPROVE][CLAUDE] PID: ${claudeProcess.pid}`)

        const currentSession = getSession()
        if (currentSession) {
          currentSession.claudeProcess = claudeProcess
        }

        // ── Heartbeat ──
        let outputReceived = false
        let totalOutputBytes = 0
        let heartbeatCount = 0

        const heartbeat = setInterval(() => {
          heartbeatCount++
          console.log(`[IMPROVE][CLAUDE] ♥ #${heartbeatCount} – output: ${outputReceived}, bytes: ${totalOutputBytes}`)
          try {
            if (claudeProcess.pid) process.kill(claudeProcess.pid, 0)
          } catch { /* dead */ }
          try {
            const gs = execSync('git status --short 2>/dev/null', {
              cwd: repoDir, encoding: 'utf-8', timeout: 5000,
            })
            if (gs.trim()) {
              const n = gs.trim().split('\n').length
              sendEvent('status', { message: `Claude is working... ${n} file(s) modified` })
            }
          } catch { /* */ }
        }, HEARTBEAT_INTERVAL_MS)

        // ── Timeout ──
        const timeoutTimer = setTimeout(() => {
          console.log(`[IMPROVE][CLAUDE] ⚠ TIMEOUT`)
          clearInterval(heartbeat)
          try { claudeProcess.kill('SIGTERM') } catch { /* */ }
          sendEvent('error', { message: `Claude timed out after ${CLAUDE_TIMEOUT_MS / 60000} min.` })
        }, CLAUDE_TIMEOUT_MS)

        // ── Parse stream-json stdout ──
        let stdoutBuffer = ''
        claudeProcess.stdout?.on('data', (data: Buffer) => {
          outputReceived = true
          const raw = data.toString()
          totalOutputBytes += raw.length

          stdoutBuffer += raw
          const lines = stdoutBuffer.split('\n')
          stdoutBuffer = lines.pop() || ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed) continue
            console.log(`[IMPROVE][CLAUDE] json-line: ${trimmed.substring(0, 300)}`)

            try {
              const evt = JSON.parse(trimmed)
              if (evt.type === 'assistant' && evt.message?.content) {
                for (const block of evt.message.content) {
                  if (block.type === 'text' && block.text) {
                    sendEvent('claude-output', { output: block.text })
                  }
                  if (block.type === 'tool_use') {
                    sendEvent('claude-output', {
                      output: `\n[Using tool: ${block.name}]\n`,
                    })
                  }
                }
              } else if (evt.type === 'result') {
                if (evt.result) {
                  sendEvent('claude-output', { output: evt.result })
                }
              }
            } catch {
              const cleaned = stripAnsi(trimmed).replace(/\r/g, '')
              if (cleaned) {
                sendEvent('claude-output', { output: cleaned })
              }
            }
          }
        })

        // ── stderr ──
        claudeProcess.stderr?.on('data', (data: Buffer) => {
          outputReceived = true
          const raw = data.toString()
          totalOutputBytes += raw.length
          const cleaned = stripAnsi(raw).replace(/\r\n/g, '\n').replace(/\r/g, '')
          console.log(`[IMPROVE][CLAUDE] stderr: ${cleaned.substring(0, 300)}`)
          if (cleaned.trim()) {
            sendEvent('claude-output', { output: cleaned })
          }
        })

        // ── Wait for exit ──
        await new Promise<void>((resolve) => {
          claudeProcess.on('close', (code: number | null) => {
            clearInterval(heartbeat)
            clearTimeout(timeoutTimer)
            console.log(`[IMPROVE][CLAUDE] ✓ Exit code: ${code}, total bytes: ${totalOutputBytes}`)

            if (stdoutBuffer.trim()) {
              try {
                const evt = JSON.parse(stdoutBuffer.trim())
                if (evt.result) {
                  sendEvent('claude-output', { output: evt.result })
                }
              } catch {
                sendEvent('claude-output', { output: stripAnsi(stdoutBuffer).replace(/\r/g, '') })
              }
            }

            try {
              const gs = execSync('git status --short 2>/dev/null', {
                cwd: repoDir, encoding: 'utf-8', timeout: 5000,
              })
              if (gs.trim()) console.log(`[IMPROVE][CLAUDE] Final changes:\n${gs.trim()}`)
            } catch { /* */ }

            sendEvent('claude-done', {
              exitCode: code,
              message: code === 0
                ? 'Claude Code session completed successfully!'
                : `Claude Code session ended (exit code: ${code})`,
            })
            resolve()
          })

          claudeProcess.on('error', (err: Error) => {
            clearInterval(heartbeat)
            clearTimeout(timeoutTimer)
            console.error(`[IMPROVE][CLAUDE] ✗ Error:`, err.message)
            sendEvent('error', { message: `Claude failed: ${err.message}` })
            resolve()
          })
        })

        console.log(`[IMPROVE] ── Session complete ──`)
        sendEvent('done', { message: 'Build session completed!' })
        controller.close()
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error)
        console.error(`[IMPROVE] ✗ Fatal:`, msg)
        sendEvent('error', { message: `Build error: ${msg}` })
        controller.close()
      }
    },

    cancel() {
      console.log(`[IMPROVE] SSE cancelled`)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

// ── DELETE: Page unmount cleanup ──
export async function DELETE() {
  console.log(`[IMPROVE] DELETE – killing claude only`)
  const session = getSession()
  if (session?.claudeProcess && !session.claudeProcess.killed) {
    try { session.claudeProcess.kill('SIGTERM') } catch { /* */ }
  }
  return NextResponse.json({ success: true })
}
