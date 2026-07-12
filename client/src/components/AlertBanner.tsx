import { AlertTriangle, AlertCircle, Info } from 'lucide-react'

interface AlertBannerProps {
  variant: 'red' | 'amber' | 'blue'
  children: React.ReactNode
  onClick?: () => void
}

const config = {
  red: {
    bg: 'rgba(239, 68, 68, 0.1)',
    border: 'rgba(239, 68, 68, 0.3)',
    color: '#f87171',
    Icon: AlertCircle,
  },
  amber: {
    bg: 'rgba(245, 158, 11, 0.1)',
    border: 'rgba(245, 158, 11, 0.3)',
    color: '#fbbf24',
    Icon: AlertTriangle,
  },
  blue: {
    bg: 'rgba(59, 130, 246, 0.1)',
    border: 'rgba(59, 130, 246, 0.3)',
    color: '#60a5fa',
    Icon: Info,
  },
}

export default function AlertBanner({ variant, children, onClick }: AlertBannerProps) {
  const { bg, border, color, Icon } = config[variant]

  return (
    <div
      className="animate-fade-in"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 18px',
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 'var(--radius-md)',
        color,
        fontSize: '0.85rem',
        fontWeight: 500,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={(e) => {
        if (onClick) e.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={(e) => {
        if (onClick) e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      <Icon size={18} strokeWidth={2} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  )
}
