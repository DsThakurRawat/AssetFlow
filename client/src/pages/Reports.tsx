import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { reportsAPI } from '../lib/api'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'
import { Download, TrendingUp, Clock } from 'lucide-react'

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4']

export default function Reports() {
  document.title = 'Reports — AssetFlow'

  const utilization = useQuery({
    queryKey: ['reports', 'utilization'],
    queryFn: () => reportsAPI.utilization().then(r => r.data),
  })

  const maintFreq = useQuery({
    queryKey: ['reports', 'maintenance-frequency'],
    queryFn: () => reportsAPI.maintenanceFrequency().then(r => r.data),
  })

  const mostUsed = useQuery({
    queryKey: ['reports', 'most-used'],
    queryFn: () => reportsAPI.mostUsed().then(r => r.data),
  })

  const idle = useQuery({
    queryKey: ['reports', 'idle'],
    queryFn: () => reportsAPI.idle().then(r => r.data),
  })

  const isLoading = utilization.isLoading || maintFreq.isLoading || mostUsed.isLoading || idle.isLoading
  const isError = utilization.isError && maintFreq.isError && mostUsed.isError && idle.isError

  if (isLoading) return <LoadingState message="Loading reports…" />
  if (isError) return <ErrorState onRetry={() => {
    utilization.refetch(); maintFreq.refetch(); mostUsed.refetch(); idle.refetch()
  }} />

  const handleExport = async () => {
    try {
      const response = await reportsAPI.exportCSV()
      const blob = new Blob([response.data], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'assetflow_report.csv'
      a.click()
      window.URL.revokeObjectURL(url)
    } catch {
      // silently fail — CSV export is Tier 2
    }
  }

  return (
    <div className="animate-fade-in" style={{ maxWidth: 1100 }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
      }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
          Reports & Analytics
        </h1>
        <button className="btn-primary" onClick={handleExport}>
          <Download size={16} />
          Export Report
        </button>
      </div>

      {/* Charts Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 16,
        marginBottom: 24,
      }}>
        {/* Utilization by Department */}
        <div className="card" style={{ padding: '20px 24px' }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 20 }}>
            Utilization by Department
          </h3>
          {utilization.data && Array.isArray(utilization.data) && utilization.data.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={utilization.data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="department"
                  tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
                  axisLine={{ stroke: 'var(--color-border)' }}
                />
                <YAxis
                  tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
                  axisLine={{ stroke: 'var(--color-border)' }}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--color-bg-card)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {utilization.data.map((_: unknown, i: number) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: '0.82rem' }}>
              No utilization data available
            </div>
          )}
        </div>

        {/* Maintenance Frequency */}
        <div className="card" style={{ padding: '20px 24px' }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 20 }}>
            Maintenance Frequency
          </h3>
          {maintFreq.data && Array.isArray(maintFreq.data) && maintFreq.data.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={maintFreq.data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="month"
                  tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
                  axisLine={{ stroke: 'var(--color-border)' }}
                />
                <YAxis
                  tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
                  axisLine={{ stroke: 'var(--color-border)' }}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--color-bg-card)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="var(--color-accent-amber)"
                  strokeWidth={2}
                  dot={{ fill: 'var(--color-accent-amber)', r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: '0.82rem' }}>
              No maintenance data available
            </div>
          )}
        </div>
      </div>

      {/* Lists Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 16,
        marginBottom: 24,
      }}>
        {/* Most Used Assets */}
        <div className="card" style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <TrendingUp size={16} style={{ color: 'var(--color-accent-green)' }} />
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600 }}>Most Used Assets</h3>
          </div>
          {mostUsed.data && Array.isArray(mostUsed.data) && mostUsed.data.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {mostUsed.data.map((item: { asset: string; usage: string }, i: number) => (
                <div key={i} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 12px',
                  background: 'var(--color-bg-input)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.82rem',
                }}>
                  <span style={{ fontWeight: 500 }}>{item.asset}</span>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>{item.usage}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.82rem' }}>
              No usage data yet
            </div>
          )}
        </div>

        {/* Idle Assets */}
        <div className="card" style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Clock size={16} style={{ color: 'var(--color-accent-amber)' }} />
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600 }}>Idle Assets</h3>
          </div>
          {idle.data && Array.isArray(idle.data) && idle.data.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {idle.data.map((item: { asset: string; idle_days: string }, i: number) => (
                <div key={i} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 12px',
                  background: 'var(--color-bg-input)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.82rem',
                }}>
                  <span style={{ fontWeight: 500 }}>{item.asset}</span>
                  <span style={{ color: 'var(--color-accent-amber)', fontSize: '0.75rem' }}>{item.idle_days}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.82rem' }}>
              No idle assets found
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
