'use client'

import styles from './SubmitButton.module.css'

interface Props {
  label: string
  active: boolean
  onClick?: () => void
}

export default function SubmitButton({ label, active, onClick }: Props) {
  return (
    <button
      type="button"
      className={`${styles.btn} ${active ? styles.active : ''}`}
      onClick={active ? onClick : undefined}
      disabled={!active}
    >
      {label}
    </button>
  )
}
