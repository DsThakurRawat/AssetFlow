import { Package } from 'lucide-react'

/** Stub page — Shivansh will build the full S4 Asset Registry screen */
export default function Assets() {
  document.title = 'Assets — AssetFlow'

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
        <Package size={28} />
      </div>
      <h1 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Assets</h1>
      <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
        Asset registry & directory — coming soon
      </p>
    </div>
  )
}
