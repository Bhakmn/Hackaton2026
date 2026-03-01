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

function markdownToHtml(md: string): string {
  let html = md
    // Headings
    .replace(/^######\s+(.+)$/gm, '<h6>$1</h6>')
    .replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>')
    .replace(/^####\s+(.+)$/gm, '<h4>$1</h4>')
    .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
    .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
    .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Images
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;height:auto;border-radius:8px;margin:1rem 0;">')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#38b8d0;">$1</a>')
    // Horizontal rules
    .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid #1e3a5f;margin:1.5rem 0;">')
    // Unordered lists
    .replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>')
    // Paragraphs (lines that aren't already HTML tags)
    .split('\n')
    .map(line => {
      const trimmed = line.trim()
      if (!trimmed) return ''
      if (trimmed.startsWith('<')) return trimmed
      return `<p>${trimmed}</p>`
    })
    .join('\n')

  // Wrap consecutive <li> elements in <ul>
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul style="padding-left:1.5rem;margin:0.5rem 0;">$1</ul>')

  return html
}

export async function GET(request: NextRequest) {
  const pageUrl = request.nextUrl.searchParams.get('url')
  if (!pageUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 })
  }

  try {
    const rootDir = process.cwd()
    const files = readdirSync(rootDir)
    const crawlFile = files.find(f => f.startsWith('crawl_') && f.endsWith('.json'))

    if (!crawlFile) {
      return NextResponse.json({ error: 'No crawl data found' }, { status: 404 })
    }

    const raw = readFileSync(join(rootDir, crawlFile), 'utf-8')
    const data: CrawlData = JSON.parse(raw)

    const page = data.pages.find(p => p.url === pageUrl)
    if (!page || !page.markdown) {
      return NextResponse.json({ error: 'Page not found in crawl data' }, { status: 404 })
    }

    const contentHtml = markdownToHtml(page.markdown)
    const origin = new URL(pageUrl).origin

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <base href="${origin}/">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #050d1a;
      color: #d8f0f5;
      padding: 2rem 2.5rem;
      line-height: 1.7;
      max-width: 900px;
      margin: 0 auto;
    }
    h1 { font-size: 2rem; font-weight: 600; margin: 1.5rem 0 1rem; color: #fff; }
    h2 { font-size: 1.5rem; font-weight: 500; margin: 1.5rem 0 0.75rem; color: #e0f4f8; border-bottom: 1px solid rgba(56,184,208,0.15); padding-bottom: 0.4rem; }
    h3 { font-size: 1.2rem; font-weight: 500; margin: 1.2rem 0 0.5rem; color: #c0e8f0; }
    h4, h5, h6 { font-size: 1rem; font-weight: 500; margin: 1rem 0 0.4rem; color: #a0d0e0; }
    p { margin: 0.5rem 0; color: #b0ccd5; font-size: 0.95rem; }
    a { color: #38b8d0; text-decoration: none; }
    a:hover { text-decoration: underline; }
    strong { color: #e0f4f8; }
    img { max-width: 100%; height: auto; border-radius: 8px; margin: 1rem 0; }
    ul, ol { padding-left: 1.5rem; margin: 0.5rem 0; }
    li { margin: 0.3rem 0; color: #b0ccd5; font-size: 0.95rem; }
    hr { border: none; border-top: 1px solid rgba(56,184,208,0.15); margin: 1.5rem 0; }
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(56,184,208,0.2); border-radius: 10px; }
  </style>
</head>
<body>
  ${contentHtml}
  <script>
    // Tag headings for scroll-to support
    var headings = document.querySelectorAll('h1,h2,h3,h4,h5,h6');
    for(var i=0;i<headings.length;i++){
      headings[i].setAttribute('data-ditto-id','ditto-h-'+i);
    }
    window.addEventListener('message',function(e){
      if(e.data && e.data.type==='scrollTo'){
        var el=document.querySelector('[data-ditto-id="'+e.data.id+'"]');
        if(el) el.scrollIntoView({behavior:'smooth',block:'start'});
      }
    });
  </script>
</body>
</html>`

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load page'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
