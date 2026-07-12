import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notificationsAPI } from '../lib/api'
import PillTabs from '../components/PillTabs'
import LoadingState from '../components/LoadingState'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import { Bell, CheckCircle } from 'lucide-react'

type FilterType = 'All' | 'Alerts' | 'Approvals' | 'Bookings'

const filterMap: Record<FilterType, string | undefined> = {
  All: undefined,
  Alerts: 'alert',
  Approvals: 'approval',
  Bookings: 'booking',
}

export default function Notifications() {
  document.title = 'Notifications — AssetFlow'
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<FilterType>('All')

  const notifs = useQuery({
    queryKey: ['notifications', filter],
    queryFn: () => notificationsAPI.list({
      type: filterMap[filter],
      limit: 50,
    }).then(r => r.data),
    refetchInterval: 15_000,
  })

  const markRead = useMutation({
    mutationFn: (id: number) => notificationsAPI.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  return (
    <div className="animate-fade-in" style={{ maxWidth: 800 }}>
      <h1 style={{
        fontSize: '1.5rem',
        fontWeight: 700,
        marginBottom: 24,
        letterSpacing: '-0.02em',
      }}>
        Notifications
      </h1>

      <div style={{ marginBottom: 20 }}>
        <PillTabs
          tabs={['All', 'Alerts', 'Approvals', 'Bookings']}
          activeTab={filter}
          onTabChange={(t) => setFilter(t as FilterType)}
        />
      </div>

      {notifs.isLoading ? (
        <LoadingState message="Loading notifications…" />
      ) : notifs.isError ? (
        <ErrorState onRetry={() => notifs.refetch()} />
      ) : !notifs.data?.length ? (
        <EmptyState
          title="No notifications"
          message="You're all caught up! Notifications will appear here when actions are taken."
          icon={<Bell size={28} />}
        />
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          {notifs.data.map((notif, i) => (
            <div
              key={notif.id}
              className="animate-fade-in"
              onClick={() => {
                if (!notif.is_read) markRead.mutate(notif.id)
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '14px 20px',
                borderBottom: i < notifs.data.length - 1
                  ? '1px solid var(--color-border)'
                  : 'none',
                cursor: notif.is_read ? 'default' : 'pointer',
                transition: 'background 0.1s',
                animationDelay: `${i * 30}ms`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--color-bg-hover)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              {/* Unread dot */}
              <div style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                flexShrink: 0,
                background: notif.is_read
                  ? 'var(--color-border-light)'
                  : notif.type === 'alert'
                  ? 'var(--color-accent-red)'
                  : notif.type === 'booking'
                  ? 'var(--color-accent-blue)'
                  : 'var(--color-accent-green)',
                transition: 'all 0.15s ease',
              }} />

              {/* Message */}
              <span style={{
                flex: 1,
                fontSize: '0.85rem',
                color: notif.is_read
                  ? 'var(--color-text-muted)'
                  : 'var(--color-text-secondary)',
                fontWeight: notif.is_read ? 400 : 500,
              }}>
                {notif.message}
              </span>

              {/* Timestamp */}
              <span style={{
                fontSize: '0.72rem',
                color: 'var(--color-text-muted)',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}>
                {formatRelativeTime(notif.created_at)}
              </span>

              {/* Read indicator */}
              {notif.is_read && (
                <CheckCircle size={14} style={{ color: 'var(--color-text-muted)', opacity: 0.4, flexShrink: 0 }} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}
