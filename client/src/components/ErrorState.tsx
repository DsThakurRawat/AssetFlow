import { AlertCircle, RefreshCw } from 'lucide-react'

interface ErrorStateProps {
  message?: string
  onRetry?: () => void
}

export default function ErrorState({
  message = 'Something went wrong. Please try again.',
  onRetry,
}: ErrorStateProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '60px 20px',
      gap: 12,
    }}>
      <div style={{
        width: 56,
        height: 56,
        borderRadius: 'var(--radius-lg)',
        background: 'var(--color-pill-red-bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--color-accent-red)',
        marginBottom: 4,
      }}>
        <AlertCircle size={28} />
      </div>
      <div style={{
        fontSize: '0.95rem',
        fontWeight: 600,
        color: 'var(--color-text-primary)',
      }}>
        Error loading data
      </div>
      <div style={{
        fontSize: '0.82rem',
        color: 'var(--color-text-muted)',
        textAlign: 'center',
        maxWidth: 320,
      }}>
        {message}
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="btn-secondary"
          style={{ marginTop: 8, gap: 6 }}
        >
          <RefreshCw size={14} />
          Try again
        </button>
      )}
    </div>
  )
}
