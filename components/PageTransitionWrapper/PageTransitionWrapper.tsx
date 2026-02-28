'use client'

import { useEffect, useRef } from 'react'
import styles from './PageTransitionWrapper.module.css'

interface Props {
  children: React.ReactNode
  maxWidth?: 'wide' | 'narrow'
}

export default function PageTransitionWrapper({ children, maxWidth = 'narrow' }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Small rAF delay ensures the initial opacity:0 state is painted before transitioning
    requestAnimationFrame(() => {
      el.classList.add(styles.visible)
    })
  }, [])

  return (
    <div
      ref={ref}
      className={`${styles.wrapper} ${maxWidth === 'wide' ? styles.wide : styles.narrow}`}
    >
      {children}
    </div>
  )
}
