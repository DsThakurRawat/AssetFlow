import { PackageOpen } from 'lucide-react'

interface EmptyStateProps {
  title?: string
  message?: string
  icon?: React.ReactNode
  action?: React.ReactNode
}

export default function EmptyState({
  title = 'No data yet',
  message = 'There are no items to display.',
  icon,
  action,
}: EmptyStateProps) {
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
        background: 'var(--color-bg-hover)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--color-text-muted)',
        marginBottom: 4,
      }}>
        {icon || <PackageOpen size={28} />}
      </div>
      <div style={{
        fontSize: '0.95rem',
        fontWeight: 600,
        color: 'var(--color-text-primary)',
      }}>
        {title}
      </div>
      <div style={{
        fontSize: '0.82rem',
        color: 'var(--color-text-muted)',
        textAlign: 'center',
        maxWidth: 320,
      }}>
        {message}
      </div>
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  )
}
