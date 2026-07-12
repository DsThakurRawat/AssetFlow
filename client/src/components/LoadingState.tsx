import { Loader2 } from 'lucide-react'

interface LoadingStateProps {
  message?: string
}

export default function LoadingState({ message = 'Loading…' }: LoadingStateProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '60px 20px',
      gap: 16,
    }}>
      <Loader2
        size={28}
        className="animate-spin"
        style={{ color: 'var(--color-accent-green)' }}
      />
      <span style={{
        fontSize: '0.85rem',
        color: 'var(--color-text-muted)',
      }}>
        {message}
      </span>
    </div>
  )
}
