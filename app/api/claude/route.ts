import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const message: string = body?.message

  if (!message) {
    return NextResponse.json({ error: 'Missing message' }, { status: 400 })
  }

  try {
    const output = await runClaude(message)
    return NextResponse.json({ response: output })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

function runClaude(message: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const isWin = process.platform === 'win32'

    // Pass the message via an env variable to avoid all shell-escaping issues.
    // %CLAUDE_MSG% on Windows, $CLAUDE_MSG on Unix.
    const msgRef = isWin ? '"%CLAUDE_MSG%"' : '"$CLAUDE_MSG"'
    const cmd = `claude -p ${msgRef} --dangerously-skip-permissions`

    const proc = spawn(cmd, [], {
      shell: true,
      env: { ...process.env, CLAUDE_MSG: message },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    proc.stdin.end()

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (d) => { stdout += d.toString() })
    proc.stderr.on('data', (d) => { stderr += d.toString() })

    const timer = setTimeout(() => {
      proc.kill()
      reject(new Error('Claude timed out. Try a simpler prompt.'))
    }, 60_000)

    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve(stdout.trim())
      } else {
        reject(new Error(stderr.trim() || `claude exited with code ${code}`))
      }
    })

    proc.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}
