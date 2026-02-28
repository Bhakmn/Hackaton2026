'use client'

import { useRouter } from 'next/navigation'
import styles from './BackButton.module.css'

export default function BackButton() {
  const router = useRouter()
  return (
    <button className={styles.backBtn} onClick={() => router.back()}>
      ← Back
    </button>
  )
}
