'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div style={{ padding: '2rem', textAlign: 'center', color: '#d8f0f5' }}>
      <h2 style={{ marginBottom: '1rem' }}>Something went wrong</h2>
      <p style={{ color: '#5a8898', marginBottom: '1.5rem' }}>{error.message}</p>
      <button
        onClick={reset}
        style={{
          background: 'none',
          border: '1px solid rgba(56, 184, 208, 0.3)',
          borderRadius: '8px',
          color: '#38b8d0',
          padding: '0.5rem 1.2rem',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        Try again
      </button>
    </div>
  )
}
