import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Package, ArrowLeftRight, CalendarClock,
  Wrench, Clock, RotateCcw, Plus,
  BookOpen, FileWarning,
} from 'lucide-react'
import { dashboardAPI, notificationsAPI } from '../lib/api'
import KPICard from '../components/KPICard'
import AlertBanner from '../components/AlertBanner'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'

export default function Dashboard() {
  document.title = 'Dashboard — AssetFlow'

  const navigate = useNavigate()

  const kpis = useQuery({
    queryKey: ['dashboard', 'kpis'],
    queryFn: () => dashboardAPI.kpis().then(r => r.data),
    refetchInterval: 30_000,
  })

  const activity = useQuery({
    queryKey: ['notifications', 'recent'],
    queryFn: () => notificationsAPI.list({ limit: 5 }).then(r => r.data),
    refetchInterval: 30_000,
  })

  if (kpis.isLoading) return <LoadingState message="Loading dashboard…" />
  if (kpis.isError) return <ErrorState onRetry={() => kpis.refetch()} />

  const data = kpis.data

  return (
    <div className="animate-fade-in" style={{ maxWidth: 1100 }}>
      {/* Heading */}
      <h1 style={{
        fontSize: '1.5rem',
        fontWeight: 700,
        marginBottom: 24,
        letterSpacing: '-0.02em',
      }}>
        Today's Overview
      </h1>

      {/* KPI Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 16,
        marginBottom: 20,
      }}>
        <KPICard
          label="Available"
          value={data?.available ?? 0}
          color="var(--color-accent-green)"
          icon={<Package size={24} />}
        />
        <KPICard
          label="Allocated"
          value={data?.allocated ?? 0}
          color="var(--color-accent-blue)"
          icon={<ArrowLeftRight size={24} />}
        />
        <KPICard
          label="Maintenance Today"
          value={data?.maintenance_today ?? 0}
          color="var(--color-accent-amber)"
          icon={<Wrench size={24} />}
        />
        <KPICard
          label="Active Bookings"
          value={data?.active_bookings ?? 0}
          color="var(--color-accent-blue)"
          icon={<CalendarClock size={24} />}
        />
        <KPICard
          label="Pending Transfers"
          value={data?.pending_transfers ?? 0}
          color="var(--color-accent-purple)"
          icon={<Clock size={24} />}
        />
        <KPICard
          label="Upcoming Returns"
          value={data?.upcoming_returns ?? 0}
          color="var(--color-text-secondary)"
          icon={<RotateCcw size={24} />}
        />
      </div>

      {/* Overdue Banner */}
      {(data?.overdue_count ?? 0) > 0 && (
        <div style={{ marginBottom: 20 }}>
          <AlertBanner
            variant="red"
            onClick={() => navigate('/allocation?filter=overdue')}
          >
            <strong>{data!.overdue_count} asset{data!.overdue_count !== 1 ? 's' : ''} overdue for return</strong>
            {' '}– flagged for follow-up
          </AlertBanner>
        </div>
      )}

      {/* Quick Actions */}
      <div style={{
        display: 'flex',
        gap: 12,
        marginBottom: 28,
        flexWrap: 'wrap',
      }}>
        <button
          className="btn-primary"
          onClick={() => navigate('/assets?action=register')}
        >
          <Plus size={16} />
          Register Asset
        </button>
        <button
          className="btn-secondary"
          onClick={() => navigate('/booking')}
        >
          <BookOpen size={16} />
          Book Resource
        </button>
        <button
          className="btn-secondary"
          onClick={() => navigate('/maintenance?action=raise')}
        >
          <FileWarning size={16} />
          Raise Request
        </button>
      </div>

      {/* Recent Activity */}
      <div className="card" style={{ padding: '20px 24px' }}>
        <h2 style={{
          fontSize: '0.95rem',
          fontWeight: 600,
          marginBottom: 16,
          color: 'var(--color-text-primary)',
        }}>
          Recent Activity
        </h2>

        {activity.isLoading ? (
          <LoadingState message="Loading activity…" />
        ) : activity.isError ? (
          <ErrorState message="Could not load activity" onRetry={() => activity.refetch()} />
        ) : (() => {
          const activityItems = Array.isArray(activity.data) ? activity.data : []
          if (activityItems.length === 0) {
            return (
              <div style={{
                padding: '24px 0',
                textAlign: 'center',
                color: 'var(--color-text-muted)',
                fontSize: '0.82rem',
              }}>
                No recent activity
              </div>
            )
          }
          return (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {activityItems.map((notif, i) => (
                <div
                  key={notif.id}
                  className="animate-fade-in"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 0',
                    borderBottom: i < activityItems.length - 1
                      ? '1px solid var(--color-border)'
                      : 'none',
                    animationDelay: `${i * 50}ms`,
                  }}
                >
                {/* Type indicator dot */}
                <div style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  flexShrink: 0,
                  background: notif.type === 'alert'
                    ? 'var(--color-accent-red)'
                    : notif.type === 'booking'
                    ? 'var(--color-accent-blue)'
                    : 'var(--color-accent-green)',
                  opacity: notif.is_read ? 0.3 : 1,
                }} />

                <span style={{
                  flex: 1,
                  fontSize: '0.82rem',
                  color: notif.is_read ? 'var(--color-text-muted)' : 'var(--color-text-secondary)',
                }}>
                  {notif.message}
                </span>

                <span style={{
                  fontSize: '0.72rem',
                  color: 'var(--color-text-muted)',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}>
                  {formatRelativeTime(notif.created_at)}
                </span>
              </div>
            ))}
            </div>
          )
        })()}
      </div>
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
