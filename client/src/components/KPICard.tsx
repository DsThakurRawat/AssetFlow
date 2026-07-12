interface KPICardProps {
  label: string
  value: number | string
  color?: string
  icon?: React.ReactNode
  onClick?: () => void
}

export default function KPICard({ label, value, color, icon, onClick }: KPICardProps) {
  return (
    <div
      className="card animate-fade-in"
      onClick={onClick}
      style={{
        padding: '20px 24px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.2s ease',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.borderColor = 'var(--color-border-light)'
          e.currentTarget.style.transform = 'translateY(-2px)'
        }
      }}
      onMouseLeave={(e) => {
        if (onClick) {
          e.currentTarget.style.borderColor = 'var(--color-border)'
          e.currentTarget.style.transform = 'translateY(0)'
        }
      }}
    >
      {/* Subtle gradient accent */}
      {color && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: color,
          borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
          opacity: 0.6,
        }} />
      )}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
      }}>
        <div>
          <div style={{
            fontSize: '0.75rem',
            fontWeight: 500,
            color: 'var(--color-text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: 8,
          }}>
            {label}
          </div>
          <div style={{
            fontSize: '2rem',
            fontWeight: 800,
            color: color || 'var(--color-text-primary)',
            lineHeight: 1,
            letterSpacing: '-0.02em',
          }}>
            {value}
          </div>
        </div>
        {icon && (
          <div style={{
            opacity: 0.3,
            color: color || 'var(--color-text-muted)',
          }}>
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}
