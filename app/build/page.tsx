'use client'

import { useState } from 'react'
import styles from './page.module.css'
import PageTransitionWrapper from '@/components/PageTransitionWrapper/PageTransitionWrapper'
import BackButton from '@/components/BackButton/BackButton'
import SubmitButton from '@/components/SubmitButton/SubmitButton'

export default function BuildPage() {
  const [requirements, setRequirements] = useState('')
  const isActive = requirements.trim().length > 10

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
            onChange={(e) => setRequirements(e.target.value)}
          />
          <p className={styles.charHint}>{requirements.length} characters</p>
        </div>

        <SubmitButton label="Start building →" active={isActive} />
      </div>
    </PageTransitionWrapper>
  )
}
