interface PillTabsProps {
  tabs: string[]
  activeTab: string
  onTabChange: (tab: string) => void
  trailing?: React.ReactNode
}

export default function PillTabs({ tabs, activeTab, onTabChange, trailing }: PillTabsProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      flexWrap: 'wrap',
    }}>
      {tabs.map((tab) => {
        const isActive = tab === activeTab
        return (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            style={{
              padding: '8px 18px',
              borderRadius: 'var(--radius-full)',
              border: `1px solid ${isActive ? 'var(--color-accent-green)' : 'var(--color-border-light)'}`,
              background: isActive ? 'rgba(34, 197, 94, 0.12)' : 'transparent',
              color: isActive ? 'var(--color-accent-green)' : 'var(--color-text-secondary)',
              fontSize: '0.82rem',
              fontWeight: isActive ? 600 : 400,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              fontFamily: 'var(--font-sans)',
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.borderColor = 'var(--color-text-muted)'
                e.currentTarget.style.color = 'var(--color-text-primary)'
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.borderColor = 'var(--color-border-light)'
                e.currentTarget.style.color = 'var(--color-text-secondary)'
              }
            }}
          >
            {tab}
          </button>
        )
      })}
      {trailing}
    </div>
  )
}
