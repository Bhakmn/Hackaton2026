import Image from 'next/image'
import styles from './page.module.css'
import PageTransitionWrapper from '@/components/PageTransitionWrapper/PageTransitionWrapper'
import OptionCard from '@/components/OptionCard/OptionCard'

export default function HomePage() {
  return (
    <PageTransitionWrapper maxWidth="wide">
      <Image src="/logo.png" alt="Ditto" width={430} height={240} className="site-logo" priority />
      <h1 className={styles.heading}>
        What would you like<br />to <em>build</em> today?
      </h1>
      <p className={styles.sub}>Choose your path to get started.</p>

      <div className={styles.outerCard}>
        <OptionCard
          icon="✦"
          title="New Website"
          description="Start from a blank canvas. We'll guide you through building your site from the ground up."
          arrowLabel="Get started"
          href="/build"
        />
        <OptionCard
          icon="⟳"
          title="Improve Existing"
          description="Already have a site? Share your URL and we'll help take it to the next level."
          arrowLabel="Continue"
          href="/improve"
        />
      </div>
    </PageTransitionWrapper>
  )
}
