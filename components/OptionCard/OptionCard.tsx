import Link from 'next/link'
import styles from './OptionCard.module.css'

interface Props {
  icon: string
  title: string
  description: string
  arrowLabel: string
  href: string
}

export default function OptionCard({ icon, title, description, arrowLabel, href }: Props) {
  return (
    <Link href={href} className={styles.option}>
      <div className={styles.icon}>{icon}</div>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.desc}>{description}</p>
      <span className={styles.arrow}>{arrowLabel} →</span>
    </Link>
  )
}
