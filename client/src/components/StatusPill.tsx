type PillVariant = 'green' | 'red' | 'amber' | 'blue' | 'muted' | 'purple'

interface StatusPillProps {
  label: string
  variant?: PillVariant
}

const variantMap: Record<PillVariant, { bg: string; color: string }> = {
  green: {
    bg: 'var(--color-pill-green-bg)',
    color: 'var(--color-pill-green-text)',
  },
  red: {
    bg: 'var(--color-pill-red-bg)',
    color: 'var(--color-pill-red-text)',
  },
  amber: {
    bg: 'var(--color-pill-amber-bg)',
    color: 'var(--color-pill-amber-text)',
  },
  blue: {
    bg: 'var(--color-pill-blue-bg)',
    color: 'var(--color-pill-blue-text)',
  },
  muted: {
    bg: 'var(--color-pill-muted-bg)',
    color: 'var(--color-pill-muted-text)',
  },
  purple: {
    bg: '#eee9f7',
    color: '#6b4fa8',
  },
}

/** Maps asset status / general status strings to pill variants */
export function getStatusVariant(status: string): PillVariant {
  const s = status.toLowerCase().replace(/[_\s]+/g, '')
  switch (s) {
    case 'active':
    case 'available':
    case 'verified':
    case 'resolved':
    case 'approved':
    case 'completed':
      return 'green'
    case 'missing':
    case 'lost':
    case 'overdue':
    case 'disposed':
    case 'rejected':
    case 'critical':
      return 'red'
    case 'undermaintenance':
    case 'maintenance':
    case 'pending':
    case 'damaged':
    case 'high':
    case 'techniciansassigned':
    case 'technicianassigned':
      return 'amber'
    case 'allocated':
    case 'confirmed':
    case 'booked':
    case 'upcoming':
    case 'ongoing':
    case 'inprogress':
    case 'requested':
      return 'blue'
    case 'retired':
    case 'inactive':
    case 'cancelled':
    case 'low':
    case 'medium':
      return 'muted'
    case 'admin':
      return 'purple'
    case 'assetmanager':
    case 'depthead':
      return 'blue'
    case 'employee':
      return 'muted'
    default:
      return 'muted'
  }
}

export default function StatusPill({ label, variant }: StatusPillProps) {
  const v = variant || getStatusVariant(label)
  const styles = variantMap[v]

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 9px',
        borderRadius: 'var(--radius-full)',
        background: styles.bg,
        color: styles.color,
        fontFamily: 'var(--font-mono)',
        fontSize: '0.64rem',
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        lineHeight: 1.5,
      }}
    >
      {label.replace(/_/g, ' ')}
    </span>
  )
}
