import { CalendarClock } from 'lucide-react'

/** Stub page — Shivansh will build the full S6 Resource Booking screen */
export default function Booking() {
  document.title = 'Resource Booking — AssetFlow'

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '80px 20px',
      gap: 16,
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
      }}>
        <CalendarClock size={28} />
      </div>
      <h1 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Resource Booking</h1>
      <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
        Time-slot booking with overlap detection — coming soon
      </p>
    </div>
  )
}
