import { NextRequest, NextResponse } from 'next/server'

interface Heading {
  tag: string
  text: string
  id: string
  level: number
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json()
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Missing url' }, { status: 400 })
    }

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Ditto/1.0)' },
      signal: AbortSignal.timeout(15000),
    })

    const html = await res.text()

    // Extract page title
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    const title = titleMatch ? titleMatch[1].trim().replace(/\s+/g, ' ') : ''

    // Extract meta description
    const descMatch = html.match(
      /<meta\s+(?:[^>]*?\s+)?(?:name|property)\s*=\s*["'](?:description|og:description)["'][^>]*?\s+content\s*=\s*["']([\s\S]*?)["'][^>]*>/i
    ) || html.match(
      /<meta\s+(?:[^>]*?\s+)?content\s*=\s*["']([\s\S]*?)["'][^>]*?\s+(?:name|property)\s*=\s*["'](?:description|og:description)["'][^>]*>/i
    )
    const description = descMatch ? (descMatch[1] || '').trim() : ''

    // Extract all headings h1-h6
    const headingRegex = /<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi
    const headings: Heading[] = []
    let match
    let index = 0

    while ((match = headingRegex.exec(html)) !== null) {
      const tag = match[1].toLowerCase()
      // Strip HTML tags from heading text
      const text = match[2].replace(/<[^>]*>/g, '').trim().replace(/\s+/g, ' ')
      if (text) {
        headings.push({
          tag,
          text,
          id: `ditto-h-${index}`,
          level: parseInt(tag[1]),
        })
        index++
      }
    }

    return NextResponse.json({ title, description, headings })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to analyse'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
