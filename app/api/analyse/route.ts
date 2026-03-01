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

    // Count images and check alt attributes
    const imgRegex = /<img\b([^>]*)>/gi
    let totalImages = 0
    let imagesWithoutAlt = 0
    let imgMatch
    while ((imgMatch = imgRegex.exec(html)) !== null) {
      totalImages++
      const attrs = imgMatch[1]
      const altMatch = attrs.match(/alt\s*=\s*["']([^"']*)["']/i)
      if (!altMatch || altMatch[1].trim() === '') imagesWithoutAlt++
    }

    // Count links
    const linkRegex = /<a\b[^>]*href\s*=\s*["']([^"']*)["'][^>]*>/gi
    const parsedOrigin = new URL(url).origin
    let internalLinks = 0
    let externalLinks = 0
    let linkMatch
    while ((linkMatch = linkRegex.exec(html)) !== null) {
      const href = linkMatch[1]
      if (href.startsWith('#') || href.startsWith('javascript:')) continue
      if (href.startsWith('/') || href.startsWith(parsedOrigin)) {
        internalLinks++
      } else if (href.startsWith('http')) {
        externalLinks++
      }
    }

    // Check for viewport meta tag
    const hasViewport = /<meta\s[^>]*name\s*=\s*["']viewport["'][^>]*>/i.test(html)

    // Check for og:image
    const hasOgImage = /<meta\s[^>]*property\s*=\s*["']og:image["'][^>]*>/i.test(html)

    // Compute word count (rough)
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
    const bodyText = bodyMatch ? bodyMatch[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : ''
    const wordCount = bodyText ? bodyText.split(/\s+/).length : 0

    // Generate issues
    const issues: string[] = []
    if (!headings.some(h => h.level === 1)) issues.push('No H1 heading')
    if (!description) issues.push('Missing meta description')
    if (!hasViewport) issues.push('Missing viewport meta tag')
    if (!hasOgImage) issues.push('No og:image meta tag')
    if (imagesWithoutAlt > 0) issues.push(`${imagesWithoutAlt} images missing alt text`)
    if (wordCount < 100) issues.push('Low word count')

    return NextResponse.json({
      title,
      description,
      headings,
      stats: {
        wordCount,
        imageCount: totalImages,
        imagesWithoutAlt,
        internalLinks,
        externalLinks,
        hasViewport,
        hasOgImage,
      },
      issues,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to analyse'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
