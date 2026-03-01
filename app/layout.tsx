import type { Metadata } from 'next'
import { Fraunces, DM_Sans } from 'next/font/google'
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
        {session && (
          <a
            href="/auth/logout"
            style={{
              position: 'fixed',
              top: '1rem',
              left: '1.2rem',
              zIndex: 10,
              color: 'var(--muted)',
              fontFamily: 'var(--font-dm-sans), sans-serif',
              fontSize: '0.78rem',
              textDecoration: 'none',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '0.35rem 0.75rem',
              background: 'rgba(10, 24, 48, 0.6)',
              backdropFilter: 'blur(8px)',
              transition: 'color 0.2s, border-color 0.2s',
            }}
          >
            Sign out
          </a>
        )}
        {children}
      </body>
    </html>
  )
}
