import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

interface CrawlPage {
  url: string
  markdown: string
  depth: number
}

interface CrawlData {
  success: boolean
  total_pages: number
  url_crawled: string
  pages: CrawlPage[]
}

interface PageHeading {
  tag: string
  text: string
  level: number
}

interface ParsedPage {
  url: string
  path: string
  title: string
  headings: PageHeading[]
  snippet: string
}

interface Section {
  name: string
  label: string
  pages: ParsedPage[]
}

function extractHeadings(markdown: string): PageHeading[] {
  const headings: PageHeading[] = []
  const regex = /^(#{1,6})\s+(.+)$/gm
  let match
  while ((match = regex.exec(markdown)) !== null) {
    const text = match[2].replace(/\*\*/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').trim()
    if (text && text.length > 1) {
      headings.push({
        tag: 'h' + match[1].length,
        text,
        level: match[1].length,
      })
    }
  }
  return headings
}

function extractTitle(markdown: string, url: string): string {
  const h1 = markdown.match(/^#\s+(.+)$/m)
  if (h1) return h1[1].replace(/\*\*/g, '').trim()
  const h2 = markdown.match(/^##\s+(.+)$/m)
  if (h2) return h2[1].replace(/\*\*/g, '').trim()
  // Fall back to last path segment
  const path = new URL(url).pathname
  const seg = path.split('/').filter(Boolean).pop() || 'Home'
  return seg.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function extractSnippet(markdown: string): string {
  // Get first paragraph-like text (not a heading, not a link-only line)
  const lines = markdown.split('\n').filter(l => {
    const t = l.trim()
    return t.length > 20 && !t.startsWith('#') && !t.startsWith('![') && !t.startsWith('[')
  })
  return lines.length > 0 ? lines[0].trim().substring(0, 150) : ''
}

function formatSectionLabel(name: string): string {
  return name
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

export async function POST(request: NextRequest) {
  try {
    const { domain } = await request.json()

    // Find a matching crawl JSON file in the project root
    const rootDir = process.cwd()
    const files = readdirSync(rootDir)
    const crawlFile = files.find(f => {
      if (!f.startsWith('crawl_') || !f.endsWith('.json')) return false
      if (domain) {
        const normalizedDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '').replace(/\./g, '_')
        return f.includes(normalizedDomain)
      }
      return true
    })

    if (!crawlFile) {
      return NextResponse.json({ error: 'No crawl data found' }, { status: 404 })
    }

    const raw = readFileSync(join(rootDir, crawlFile), 'utf-8')
    const data: CrawlData = JSON.parse(raw)

    // Filter to content pages only
    const contentPages = data.pages.filter(p => p.markdown && p.markdown.length > 10)

    // Group pages by first URL path segment
    const sectionMap = new Map<string, ParsedPage[]>()

    for (const page of contentPages) {
      const parsedUrl = new URL(page.url)
      const pathParts = parsedUrl.pathname.split('/').filter(Boolean)
      const sectionKey = pathParts[0] || 'home'

      const parsed: ParsedPage = {
        url: page.url,
        path: parsedUrl.pathname,
        title: extractTitle(page.markdown, page.url),
        headings: extractHeadings(page.markdown),
        snippet: extractSnippet(page.markdown),
      }

      const existing = sectionMap.get(sectionKey) || []
      // Avoid duplicate URLs
      if (!existing.some(p => p.url === parsed.url)) {
        existing.push(parsed)
        sectionMap.set(sectionKey, existing)
      }
    }

    // Convert to sections array, sorted by page count
    const sections: Section[] = Array.from(sectionMap.entries())
      .map(([name, pages]) => ({
        name,
        label: formatSectionLabel(name),
        pages,
      }))
      .sort((a, b) => b.pages.length - a.pages.length)

    return NextResponse.json({
      url: data.url_crawled,
      totalPages: contentPages.length,
      sections,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to parse crawl data'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
