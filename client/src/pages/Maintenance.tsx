import { Wrench } from 'lucide-react'

/** Stub page — Shivansh will build the full S7 Maintenance kanban screen */
export default function Maintenance() {
  document.title = 'Maintenance — AssetFlow'

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
        <Wrench size={28} />
      </div>
      <h1 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Maintenance</h1>
      <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
        Approval workflow kanban board — coming soon
      </p>
    </div>
  )
}
