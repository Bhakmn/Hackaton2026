'use client'

import { useState, useRef, useEffect } from 'react'
import styles from './page.module.css'
import PageTransitionWrapper from '@/components/PageTransitionWrapper/PageTransitionWrapper'
import BackButton from '@/components/BackButton/BackButton'
import SubmitButton from '@/components/SubmitButton/SubmitButton'

interface Heading {
  tag: string
  text: string
  id: string
  level: number
}

interface AnalysisData {
  title: string
  description: string
  headings: Heading[]
}

// Crawl data types
interface PageHeading {
  tag: string
  text: string
  level: number
}

interface CrawlPage {
  url: string
  path: string
  title: string
  headings: PageHeading[]
  snippet: string
}

interface CrawlSection {
  name: string
  label: string
  pages: CrawlPage[]
}

interface CrawlData {
  url: string
  totalPages: number
  sections: CrawlSection[]
}

export default function ImprovePage() {
  const [url, setUrl] = useState('')
  const [analysedUrl, setAnalysedUrl] = useState('')
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null)
  const [crawlData, setCrawlData] = useState<CrawlData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set())
  const [previewUrl, setPreviewUrl] = useState('')
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const workspaceRef = useRef<HTMLDivElement>(null)

  const isActive = url.trim().length > 3
  const hasResults = analysis || crawlData

  useEffect(() => {
    if (hasResults && workspaceRef.current) {
      requestAnimationFrame(() => {
        workspaceRef.current?.classList.add(styles.visible)
      })
    }
  }, [hasResults])

  // Move logo when analysis view is active
  useEffect(() => {
    const logo = document.querySelector('.site-logo') as HTMLElement | null
    if (!logo) return
    if (hasResults) {
      logo.classList.add(styles.logoMoved)
    } else {
      logo.classList.remove(styles.logoMoved)
    }
    return () => { logo.classList.remove(styles.logoMoved) }
  }, [hasResults])

  async function handleAnalyse() {
    if (!isActive) return

    let finalUrl = url.trim()
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = 'https://' + finalUrl
    }

    setLoading(true)
    setError('')

    // First try crawl data
    try {
      const crawlRes = await fetch('/api/analyse-crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: finalUrl }),
      })

      if (crawlRes.ok) {
        const data: CrawlData = await crawlRes.json()
        setCrawlData(data)
        setAnalysedUrl(finalUrl)
        setPreviewUrl(finalUrl)
        // Auto-expand first section
        if (data.sections.length > 0) {
          setExpandedSections(new Set([data.sections[0].name]))
        }
        setLoading(false)
        return
      }
    } catch {
      // Fall through to single-page analysis
    }

    // Fallback: single page analysis
    try {
      const res = await fetch('/api/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: finalUrl }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to analyse')
      }

      const data: AnalysisData = await res.json()
      setAnalysis(data)
      setAnalysedUrl(finalUrl)
      setPreviewUrl(finalUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  function handleScrollTo(id: string) {
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'scrollTo', id },
      '*'
    )
  }

  function toggleSection(key: string) {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function togglePage(key: string) {
    setExpandedPages(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function handleBack() {
    setAnalysis(null)
    setCrawlData(null)
    setAnalysedUrl('')
    setPreviewUrl('')
    setError('')
    setExpandedSections(new Set())
    setExpandedPages(new Set())
  }

  function handlePreviewPage(pageUrl: string) {
    setPreviewUrl(pageUrl)
  }

  // ── Render crawl sidebar ──
  function renderCrawlTree() {
    if (!crawlData) return null

    return crawlData.sections.map(section => {
      const isExpanded = expandedSections.has(section.name)

      return (
        <div key={section.name} className={styles.sectionGroup}>
          <button
            className={`${styles.sectionHeader} ${isExpanded ? styles.expanded : ''}`}
            onClick={() => toggleSection(section.name)}
          >
            <span className={styles.sectionTag}>{section.pages.length}</span>
            <span className={styles.sectionText}>{section.label}</span>
            <span className={styles.chevron}>{isExpanded ? '▾' : '▸'}</span>
          </button>

          {isExpanded && (
            <div className={styles.sectionChildren}>
              {section.pages.map(page => {
                const pageKey = page.url
                const isPageExpanded = expandedPages.has(pageKey)
                const isActive = previewUrl === page.url

                return (
                  <div key={page.url} className={styles.pageItem}>
                    <button
                      className={`${styles.pageHeader} ${isActive ? styles.pageActive : ''}`}
                      onClick={() => {
                        handlePreviewPage(page.url)
                        if (page.headings.length > 0) togglePage(pageKey)
                      }}
                    >
                      <span className={styles.pageTitle}>{page.title}</span>
                      {page.headings.length > 0 && (
                        <span className={styles.pageCount}>
                          {page.headings.length}
                        </span>
                      )}
                    </button>

                    {isPageExpanded && page.headings.length > 0 && (
                      <div className={styles.pageHeadings}>
                        {page.headings.slice(0, 8).map((h, idx) => (
                          <div
                            key={idx}
                            className={styles.pageHeading}
                            style={{ paddingLeft: `${(h.level - 1) * 0.6}rem` }}
                          >
                            <span className={styles.childTag}>{h.tag.toUpperCase()}</span>
                            <span className={styles.childText}>{h.text}</span>
                          </div>
                        ))}
                        {page.headings.length > 8 && (
                          <div className={styles.moreHeadings}>
                            +{page.headings.length - 8} more
                          </div>
                        )}
                      </div>
                    )}

                    {page.snippet && isPageExpanded && (
                      <p className={styles.pageSnippet}>{page.snippet}</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )
    })
  }

  // ── Render single-page heading tree ──
  function renderHeadingTree() {
    if (!analysis) return null
    const { headings } = analysis
    const elements: React.ReactNode[] = []
    let i = 0

    while (i < headings.length) {
      const h = headings[i]
      if (h.level <= 2) {
        const children: Heading[] = []
        let j = i + 1
        while (j < headings.length && headings[j].level > h.level) {
          children.push(headings[j])
          j++
        }

        const isExpanded = expandedSections.has(String(i))
        const hasChildren = children.length > 0

        elements.push(
          <div key={h.id} className={styles.sectionGroup}>
            <button
              className={`${styles.sectionHeader} ${isExpanded ? styles.expanded : ''}`}
              onClick={() => {
                if (hasChildren) toggleSection(String(i))
                handleScrollTo(h.id)
              }}
            >
              <span className={styles.sectionTag}>{h.tag.toUpperCase()}</span>
              <span className={styles.sectionText}>{h.text}</span>
              {hasChildren && (
                <span className={styles.chevron}>{isExpanded ? '▾' : '▸'}</span>
              )}
            </button>
            {isExpanded && hasChildren && (
              <div className={styles.sectionChildren}>
                {children.map(child => (
                  <button
                    key={child.id}
                    className={styles.childHeading}
                    style={{ paddingLeft: `${(child.level - h.level) * 1}rem` }}
                    onClick={() => handleScrollTo(child.id)}
                  >
                    <span className={styles.childTag}>{child.tag.toUpperCase()}</span>
                    <span className={styles.childText}>{child.text}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )
        i = j
      } else {
        elements.push(
          <button
            key={h.id}
            className={styles.childHeading}
            onClick={() => handleScrollTo(h.id)}
          >
            <span className={styles.childTag}>{h.tag.toUpperCase()}</span>
            <span className={styles.childText}>{h.text}</span>
          </button>
        )
        i++
      }
    }
    return elements
  }

  // ── Phase 1: URL input form ──
  if (!hasResults) {
    return (
      <PageTransitionWrapper maxWidth="narrow">
        <BackButton />
        <div className={styles.card}>
          <p className={styles.eyebrow}>Improve Existing Site</p>
          <h2 className={styles.heading}>Share your website</h2>
          <p className={styles.sub}>Paste your current URL and we&apos;ll take a look.</p>

          <div className={styles.inputWrap}>
            <input
              className={styles.urlInput}
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
            label={loading ? 'Analysing...' : 'Analyse my website →'}
            active={isActive && !loading}
            onClick={handleAnalyse}
          />
        </div>
      </PageTransitionWrapper>
    )
  }

  // ── Phase 2: Analysis view ──
  const title = crawlData ? 'Site Map' : (analysis?.title || '')
  const totalCount = crawlData
    ? `${crawlData.totalPages} pages`
    : `${analysis?.headings.length || 0} headings`

  return (
    <div ref={workspaceRef} className={styles.workspace}>
      {/* Top title bar */}
      <div className={styles.titleBar}>
        <button className={styles.navBack} onClick={handleBack}>← Back</button>
        <div className={styles.titleInfo}>
          {title && <h1 className={styles.titleText}>{title}</h1>}
          <span className={styles.pageUrl}>{analysedUrl}</span>
        </div>
        <button
          className={styles.navToggle}
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          {sidebarOpen ? '◧' : '☰'}
        </button>
      </div>

      <div className={styles.analysisBody}>
        {/* Left sidebar */}
        {sidebarOpen && (
          <div className={styles.sidebar}>
            <div className={styles.sidebarHeader}>
              <span className={styles.sidebarTitle}>
                {crawlData ? 'Site Structure' : 'Page Structure'}
              </span>
              <span className={styles.sidebarCount}>{totalCount}</span>
            </div>

            {!crawlData && analysis?.description && (
              <p className={styles.sidebarDesc}>{analysis.description}</p>
            )}

            <div className={styles.headingTree}>
              {crawlData ? renderCrawlTree() : (
                analysis && analysis.headings.length > 0
                  ? renderHeadingTree()
                  : <p className={styles.noHeadings}>No headings found.</p>
              )}
            </div>
          </div>
        )}

        {/* Right panel: iframe preview */}
        <div className={styles.previewPanel}>
          <div className={styles.iframeWrap}>
            <iframe
              ref={iframeRef}
              src={crawlData
                ? `/api/crawl-page?url=${encodeURIComponent(previewUrl)}`
                : `/api/proxy?url=${encodeURIComponent(previewUrl)}`
              }
              className={styles.iframe}
              title="Website preview"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
