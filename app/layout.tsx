import type { Metadata } from 'next'
import { Fraunces, DM_Sans } from 'next/font/google'
import Image from 'next/image'
import './globals.css'
import Starfield from '../components/Starfield/Starfield'
import { auth0 } from '@/lib/auth0'

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['300', '500'],
  style: ['normal', 'italic'],
  variable: '--font-fraunces',
  display: 'swap',
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-dm-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Ditto',
  description: 'Build or improve your website.',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth0.getSession()

  return (
    <html lang="en" className={`${fraunces.variable} ${dmSans.variable}`}>
      <body>
        <Starfield />
        <Image src="/logo.png" alt="Ditto" width={430} height={240} className="site-logo" priority />
        {session && (
          <nav style={{ position: 'fixed', top: '1rem', left: '1.2rem', zIndex: 10 }}>
            <span style={{ color: '#d8f0f5', fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: '0.85rem' }}>
              {session.user.name ?? session.user.email}
            </span>
            {' '}
            <a
              href="/auth/logout"
              style={{
                color: '#38b8d0',
                fontFamily: 'var(--font-dm-sans), sans-serif',
                fontSize: '0.85rem',
                textDecoration: 'none',
              }}
            >
              Log out
            </a>
          </nav>
        )}
        {children}
      </body>
    </html>
  )
}
