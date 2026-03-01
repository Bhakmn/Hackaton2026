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

interface SinglePageStats {
  wordCount: number
  imageCount: number
  imagesWithoutAlt: number
  internalLinks: number
  externalLinks: number
  hasViewport: boolean
  hasOgImage: boolean
}

interface AnalysisData {
  title: string
  description: string
  headings: Heading[]
  stats?: SinglePageStats
  issues?: string[]
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
  wordCount: number
  imageCount: number
  internalLinks: number
  externalLinks: number
  description: string
  issues: string[]
}

interface CrawlSection {
  name: string
  label: string
  pages: CrawlPage[]
}

interface SiteStats {
  totalPages: number
  totalWords: number
  avgWordsPerPage: number
  totalImages: number
  imagesWithoutAlt: number
  totalIssues: number
}

interface SiteIssue {
  severity: 'critical' | 'warning' | 'info'
  message: string
  page?: string
}

interface CrawlData {
  url: string
  totalPages: number
  sections: CrawlSection[]
  stats?: SiteStats
  issues?: SiteIssue[]
}

type SidebarTab = 'structure' | 'insights'

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
  const [activeTab, setActiveTab] = useState<SidebarTab>('structure')
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const workspaceRef = useRef<HTMLDivElement>(null)

  const isActive = url.trim().length > 3
  const hasResults = analysis || crawlData

  // Find the currently selected crawl page
  const selectedCrawlPage = crawlData
    ? crawlData.sections.flatMap(s => s.pages).find(p => p.url === previewUrl)
    : null

  useEffect(() => {
    if (hasResults && workspaceRef.current) {
      requestAnimationFrame(() => {
        workspaceRef.current?.classList.add(styles.visible)
      })
    }
  }, [hasResults])

  // Listen for navigateTo messages from iframe (link clicks inside preview)
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type === 'navigateTo' && typeof e.data.url === 'string') {
        setPreviewUrl(e.data.url)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

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
    setActiveTab('structure')
  }

  function handlePreviewPage(pageUrl: string) {
    setPreviewUrl(pageUrl)
  }

  // ── Stats strip ──
  function renderStatsStrip() {
    if (crawlData?.stats) {
      const s = crawlData.stats
      return (
        <div className={styles.statsStrip}>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{s.totalPages}</span>
            <span className={styles.statLabel}>Pages</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{s.totalWords.toLocaleString()}</span>
            <span className={styles.statLabel}>Words</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{s.avgWordsPerPage}</span>
            <span className={styles.statLabel}>Avg Words/Page</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{s.totalImages}</span>
            <span className={styles.statLabel}>Images</span>
          </div>
          <div className={`${styles.statCard} ${s.totalIssues > 0 ? styles.statWarning : ''}`}>
            <span className={styles.statValue}>{s.totalIssues}</span>
            <span className={styles.statLabel}>Issues</span>
          </div>
        </div>
      )
    }

    if (analysis?.stats) {
      const s = analysis.stats
      return (
        <div className={styles.statsStrip}>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{s.wordCount.toLocaleString()}</span>
            <span className={styles.statLabel}>Words</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{s.imageCount}</span>
            <span className={styles.statLabel}>Images</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{s.internalLinks}</span>
            <span className={styles.statLabel}>Internal Links</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{s.externalLinks}</span>
            <span className={styles.statLabel}>External Links</span>
          </div>
          <div className={`${styles.statCard} ${(analysis.issues?.length || 0) > 0 ? styles.statWarning : ''}`}>
            <span className={styles.statValue}>{analysis.issues?.length || 0}</span>
            <span className={styles.statLabel}>Issues</span>
          </div>
        </div>
      )
    }

    return null
  }

  // ── Render insights tab ──
  function renderInsights() {
    // Crawl mode: site-wide issues
    if (crawlData?.issues && crawlData.issues.length > 0) {
      const critical = crawlData.issues.filter(i => i.severity === 'critical')
      const warnings = crawlData.issues.filter(i => i.severity === 'warning')
      const info = crawlData.issues.filter(i => i.severity === 'info')

      return (
        <div className={styles.issueList}>
          {critical.length > 0 && (
            <div className={styles.issueGroup}>
              <div className={styles.issueGroupHeader}>
                <span className={`${styles.issueDot} ${styles.issueCritical}`} />
                <span>Critical ({critical.length})</span>
              </div>
              {critical.map((issue, idx) => (
                <div key={idx} className={styles.issueItem}>
                  <span className={`${styles.issueSeverity} ${styles.issueCritical}`}>!</span>
                  <div className={styles.issueContent}>
                    <span className={styles.issueMessage}>{issue.message}</span>
                    {issue.page && <span className={styles.issuePage}>{issue.page}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {warnings.length > 0 && (
            <div className={styles.issueGroup}>
              <div className={styles.issueGroupHeader}>
                <span className={`${styles.issueDot} ${styles.issueWarning}`} />
                <span>Warnings ({warnings.length})</span>
              </div>
              {warnings.map((issue, idx) => (
                <div key={idx} className={styles.issueItem}>
                  <span className={`${styles.issueSeverity} ${styles.issueWarning}`}>!</span>
                  <div className={styles.issueContent}>
                    <span className={styles.issueMessage}>{issue.message}</span>
                    {issue.page && <span className={styles.issuePage}>{issue.page}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {info.length > 0 && (
            <div className={styles.issueGroup}>
              <div className={styles.issueGroupHeader}>
                <span className={`${styles.issueDot} ${styles.issueInfo}`} />
                <span>Info ({info.length})</span>
              </div>
              {info.map((issue, idx) => (
                <div key={idx} className={styles.issueItem}>
                  <span className={`${styles.issueSeverity} ${styles.issueInfo}`}>i</span>
                  <div className={styles.issueContent}>
                    <span className={styles.issueMessage}>{issue.message}</span>
                    {issue.page && <span className={styles.issuePage}>{issue.page}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }

    // Single-page mode: issues list
    if (analysis?.issues && analysis.issues.length > 0) {
      return (
        <div className={styles.issueList}>
          {analysis.issues.map((issue, idx) => (
            <div key={idx} className={styles.issueItem}>
              <span className={`${styles.issueSeverity} ${
                issue.includes('No H1') || issue.includes('Missing meta')
                  ? styles.issueCritical
                  : styles.issueWarning
              }`}>!</span>
              <div className={styles.issueContent}>
                <span className={styles.issueMessage}>{issue}</span>
              </div>
            </div>
          ))}
        </div>
      )
    }

    return (
      <div className={styles.noIssues}>
        <span className={styles.noIssuesIcon}>&#10003;</span>
        <p>No issues found. Looking good!</p>
      </div>
    )
  }

  // ── Page detail bar (shown above iframe when a crawl page is selected) ──
  function renderPageDetail() {
    if (selectedCrawlPage) {
      const p = selectedCrawlPage
      return (
        <div className={styles.pageDetail}>
          <div className={styles.pageDetailInfo}>
            <span className={styles.pageDetailTitle}>{p.title}</span>
            {p.description && (
              <span className={styles.pageDetailDesc}>{p.description.substring(0, 120)}</span>
            )}
          </div>
          <div className={styles.pageDetailStats}>
            <span className={styles.pageDetailStat}>{p.wordCount ?? 0} words</span>
            <span className={styles.pageDetailStat}>{p.headings?.length ?? 0} headings</span>
            <span className={styles.pageDetailStat}>{p.imageCount ?? 0} images</span>
            <span className={styles.pageDetailStat}>{(p.internalLinks ?? 0) + (p.externalLinks ?? 0)} links</span>
            {(p.issues?.length ?? 0) > 0 && (
              <span className={`${styles.pageDetailStat} ${styles.pageDetailIssue}`}>
                {p.issues!.length} issue{p.issues!.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      )
    }

    // Single-page stats
    if (analysis?.stats) {
      const s = analysis.stats
      return (
        <div className={styles.pageDetail}>
          <div className={styles.pageDetailInfo}>
            <span className={styles.pageDetailTitle}>{analysis.title}</span>
            {analysis.description && (
              <span className={styles.pageDetailDesc}>{analysis.description.substring(0, 120)}</span>
            )}
          </div>
          <div className={styles.pageDetailStats}>
            <span className={styles.pageDetailStat}>{s.wordCount} words</span>
            <span className={styles.pageDetailStat}>{s.imageCount} images</span>
            <span className={styles.pageDetailStat}>{s.internalLinks} int. links</span>
            <span className={styles.pageDetailStat}>{s.externalLinks} ext. links</span>
            {s.hasViewport && <span className={`${styles.pageDetailStat} ${styles.pageDetailGood}`}>Viewport OK</span>}
            {s.hasOgImage && <span className={`${styles.pageDetailStat} ${styles.pageDetailGood}`}>OG Image OK</span>}
          </div>
        </div>
      )
    }

    return null
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
                const isActivePage = previewUrl === page.url

                return (
                  <div key={page.url} className={styles.pageItem}>
                    <button
                      className={`${styles.pageHeader} ${isActivePage ? styles.pageActive : ''}`}
                      onClick={() => {
                        handlePreviewPage(page.url)
                        if (page.headings.length > 0) togglePage(pageKey)
                      }}
                    >
                      <span className={styles.pageTitle}>
                        {page.title}
                        {(page.issues?.length ?? 0) > 0 && (
                          <span className={styles.pageIssueBadge}>{page.issues.length}</span>
                        )}
                      </span>
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
            label={loading ? 'Analysing...' : 'Analyse my website'}
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

  const issueCount = crawlData?.stats?.totalIssues ?? analysis?.issues?.length ?? 0

  return (
    <div ref={workspaceRef} className={styles.workspace}>
      {/* Top title bar */}
      <div className={styles.titleBar}>
        <button className={styles.navBack} onClick={handleBack}>&#8592; Back</button>
        <div className={styles.titleInfo}>
          {title && <h1 className={styles.titleText}>{title}</h1>}
          <span className={styles.pageUrl}>{analysedUrl}</span>
        </div>
        <button
          className={styles.navToggle}
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          {sidebarOpen ? '\u25E7' : '\u2630'}
        </button>
      </div>

      {/* Stats strip */}
      {renderStatsStrip()}

      <div className={styles.analysisBody}>
        {/* Left sidebar */}
        {sidebarOpen && (
          <div className={styles.sidebar}>
            {/* Tab bar */}
            <div className={styles.tabBar}>
              <button
                className={`${styles.tab} ${activeTab === 'structure' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('structure')}
              >
                Structure
                <span className={styles.tabCount}>{totalCount}</span>
              </button>
              <button
                className={`${styles.tab} ${activeTab === 'insights' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('insights')}
              >
                Insights
                {issueCount > 0 && (
                  <span className={`${styles.tabCount} ${styles.tabCountWarning}`}>{issueCount}</span>
                )}
              </button>
            </div>

            {activeTab === 'structure' && (
              <>
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
              </>
            )}

            {activeTab === 'insights' && (
              <div className={styles.headingTree}>
                {renderInsights()}
              </div>
            )}
          </div>
        )}

        {/* Right panel: page detail + iframe preview */}
        <div className={styles.previewPanel}>
          {renderPageDetail()}
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
