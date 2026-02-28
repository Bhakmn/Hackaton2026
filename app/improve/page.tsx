'use client'

import { useState } from 'react'
import styles from './page.module.css'
import PageTransitionWrapper from '@/components/PageTransitionWrapper/PageTransitionWrapper'
import BackButton from '@/components/BackButton/BackButton'
import SubmitButton from '@/components/SubmitButton/SubmitButton'

export default function ImprovePage() {
  const [url, setUrl] = useState('')
  const isActive = url.trim().length > 3

  return (
    <PageTransitionWrapper maxWidth="narrow">
      <BackButton />
      <div className={styles.card}>
        <p className={styles.eyebrow}>Improve Existing Site</p>
        <h2 className={styles.heading}>Share your website</h2>
        <p className={styles.sub}>Paste your current URL and we'll take a look.</p>

        <div className={styles.inputWrap}>
          <input
            className={styles.urlInput}
            type="url"
            placeholder="https://yourwebsite.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>

        <SubmitButton label="Analyse my website →" active={isActive} />
      </div>
    </PageTransitionWrapper>
  )
}
