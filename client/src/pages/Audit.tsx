import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { usersAPI, auditAPI, type User } from '../lib/api'
import { useAuth } from '../lib/auth'
import LoadingState from '../components/LoadingState'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import AlertBanner from '../components/AlertBanner'
import { Plus, X, Lock, ClipboardCheck, CheckCircle2, HelpCircle, AlertTriangle } from 'lucide-react'

/* ================================================================
   Types
   ================================================================ */
type ItemStatus = 'pending' | 'verified' | 'missing' | 'damaged'

interface Cycle {
  id: number
  name: string
  scope: string
  auditor_name: string
  start_date: string
  end_date: string
  is_closed: boolean
  total_items: number
  flagged_count: number
}

interface AuditItem {
  id: number
  asset_id: number
  asset_tag: string
  asset_name: string
  expected_location: string
  status: ItemStatus
  note: string | null
}

interface CycleDetail {
  id: number
  name: string
  scope: string
  auditor_name: string
  start_date: string
  end_date: string
  is_closed: boolean
  items: AuditItem[]
}

/* ================================================================
   Page
   ================================================================ */
export default function Audit() {
  document.title = 'Audit — AssetFlow'
  const { user } = useAuth()
  const canManage = user?.role === 'admin' || user?.role === 'asset_manager' || user?.role === 'dept_head'

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showNew, setShowNew] = useState(false)

  const cyclesQuery = useQuery({
    queryKey: ['audits'],
    queryFn: () => auditAPI.list().then((r) => r.data as Cycle[]),
  })

  // Auto-select the first cycle once the list loads (if nothing chosen yet).
  useEffect(() => {
    if (selectedId === null && cyclesQuery.data && cyclesQuery.data.length > 0) {
      setSelectedId(cyclesQuery.data[0].id)
    }
  }, [cyclesQuery.data, selectedId])

  return (
    <div className="animate-fade-in" style={{ maxWidth: 1200 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em' }}>Asset Audit</h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.82rem', marginTop: 4 }}>
            Structured verification cycles with automatic discrepancy reporting.
          </p>
        </div>
        {canManage && (
          <button
            className="btn-primary"
            style={{ padding: '8px 16px', fontSize: '0.8rem' }}
            onClick={() => setShowNew((v) => !v)}
          >
            <Plus size={14} />
            New cycle
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* ---- Left: cycle list ---- */}
        <div style={{ flex: '0 0 280px', minWidth: 240 }}>
          <CycleList
            query={cyclesQuery}
            selectedId={selectedId}
            onSelect={(id: number) => {
              setSelectedId(id)
              setShowNew(false)
            }}
          />
        </div>

        {/* ---- Right: new-cycle form or selected cycle ---- */}
        <div style={{ flex: '1 1 560px', minWidth: 320 }}>
          {showNew && canManage ? (
            <NewCycleForm
              onCancel={() => setShowNew(false)}
              onCreated={(id: number) => {
                setSelectedId(id)
                setShowNew(false)
              }}
            />
          ) : selectedId !== null ? (
            <CyclePanel cycleId={selectedId} canManage={canManage} />
          ) : cyclesQuery.isLoading ? (
            <div className="card" style={{ padding: 8 }}>
              <LoadingState />
            </div>
          ) : (
            <div className="card">
              <EmptyState
                title="No audit cycle selected"
                message={
                  canManage
                    ? 'Create a new audit cycle to begin verifying assets.'
                    : 'No audit cycles are available yet.'
                }
                icon={<ClipboardCheck size={28} />}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ================================================================
   Left column — list of cycles
   ================================================================ */
function CycleList({
  query,
  selectedId,
  onSelect,
}: {
  query: UseQueryResult<Cycle[], Error>
  selectedId: number | null
  onSelect: (id: number) => void
}) {
  if (query.isLoading) {
    return (
      <div className="card" style={{ padding: 8 }}>
        <LoadingState message="Loading cycles…" />
      </div>
    )
  }
  if (query.isError) {
    return (
      <div className="card" style={{ padding: 8 }}>
        <ErrorState message="Could not load audit cycles." onRetry={() => query.refetch()} />
      </div>
    )
  }
  if (!query.data?.length) {
    return (
      <div className="card">
        <EmptyState title="No cycles yet" message="Audit cycles will appear here." icon={<ClipboardCheck size={28} />} />
      </div>
    )
  }

  return (
    <div className="card" style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {query.data.map((c: Cycle) => {
        const active = c.id === selectedId
        return (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            style={{
              textAlign: 'left',
              padding: '12px 14px',
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${active ? 'var(--color-accent-green)' : 'transparent'}`,
              background: active ? 'var(--color-bg-hover)' : 'transparent',
              color: 'var(--color-text-primary)',
              cursor: 'pointer',
              transition: 'background 0.1s',
            }}
            onMouseEnter={(e) => {
              if (!active) e.currentTarget.style.background = 'var(--color-bg-hover)'
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.background = 'transparent'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, lineHeight: 1.3 }}>{c.name}</span>
              {c.is_closed && (
                <Lock size={12} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
              )}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
              {c.scope || '—'}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginTop: 6 }}>
              {c.total_items} assets
              {c.flagged_count > 0 && (
                <span style={{ color: 'var(--color-accent-amber, #fbbf24)' }}> · {c.flagged_count} flagged</span>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}

/* ================================================================
   New cycle form
   ================================================================ */
function NewCycleForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void
  onCreated: (id: number) => void
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [scope, setScope] = useState('')
  const [auditorId, setAuditorId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [formError, setFormError] = useState('')

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => usersAPI.list().then((r) => r.data),
  })

  const createMut = useMutation({
    mutationFn: (data: {
      name: string
      scope: string
      auditor_id: number
      start_date: string
      end_date: string
    }) => auditAPI.create(data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['audits'] })
      const created = res.data as { id: number }
      onCreated(created.id)
    },
    onError: (err: unknown) => {
      if (isAxiosError(err)) setFormError(err.response?.data?.detail || 'Failed to create audit cycle')
      else setFormError('Failed to create audit cycle')
    },
  })

  const valid = name.trim() && scope.trim() && auditorId && startDate && endDate

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.75rem',
    color: 'var(--color-text-muted)',
    marginBottom: 4,
  }

  return (
    <div className="card animate-fade-in" style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>New audit cycle</h3>
        <button
          onClick={onCancel}
          style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}
        >
          <X size={18} />
        </button>
      </div>

      {formError && (
        <div
          style={{
            padding: '8px 12px',
            marginBottom: 12,
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-pill-red-bg)',
            color: 'var(--color-pill-red-text)',
            fontSize: '0.8rem',
          }}
        >
          {formError}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Name *</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Q3 audit: Engineering dept"
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Scope (department / location) *</label>
          <input
            className="input"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            placeholder="Engineering — Floor 3"
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Auditor *</label>
          <select className="select" value={auditorId} onChange={(e) => setAuditorId(e.target.value)}>
            <option value="">Select an auditor…</option>
            {(usersQuery.data || []).map((u: User) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Start date *</label>
          <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>End date *</label>
          <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
        <button className="btn-secondary" style={{ padding: '10px 18px' }} onClick={onCancel}>
          Cancel
        </button>
        <button
          className="btn-primary"
          style={{ padding: '10px 20px' }}
          disabled={!valid || createMut.isPending}
          onClick={() =>
            createMut.mutate({
              name: name.trim(),
              scope: scope.trim(),
              auditor_id: Number(auditorId),
              start_date: startDate,
              end_date: endDate,
            })
          }
        >
          {createMut.isPending ? 'Creating…' : 'Create cycle'}
        </button>
      </div>
    </div>
  )
}

/* ================================================================
   Selected cycle panel
   ================================================================ */
function CyclePanel({ cycleId, canManage }: { cycleId: number; canManage: boolean }) {
  const queryClient = useQueryClient()

  const cycleQuery = useQuery({
    queryKey: ['audit', cycleId],
    queryFn: () => auditAPI.get(cycleId).then((r) => r.data as CycleDetail),
  })

  const updateItemMut = useMutation({
    mutationFn: ({ itemId, status }: { itemId: number; status: ItemStatus }) =>
      auditAPI.updateItem(itemId, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit', cycleId] })
      queryClient.invalidateQueries({ queryKey: ['audits'] })
    },
  })

  const closeMut = useMutation({
    mutationFn: () => auditAPI.close(cycleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit', cycleId] })
      queryClient.invalidateQueries({ queryKey: ['audits'] })
    },
  })

  if (cycleQuery.isLoading) {
    return (
      <div className="card" style={{ padding: 8 }}>
        <LoadingState message="Loading cycle…" />
      </div>
    )
  }
  if (cycleQuery.isError || !cycleQuery.data) {
    return (
      <div className="card" style={{ padding: 8 }}>
        <ErrorState message="Could not load this audit cycle." onRetry={() => cycleQuery.refetch()} />
      </div>
    )
  }

  const cycle = cycleQuery.data
  const readOnly = cycle.is_closed || !canManage
  const flaggedCount = cycle.items.filter(
    (i: AuditItem) => i.status === 'missing' || i.status === 'damaged'
  ).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Cycle header card */}
      <div className="card" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, letterSpacing: '-0.01em' }}>
              {cycle.name} – {cycle.start_date}–{cycle.end_date}
            </h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginTop: 6 }}>
              Auditor: {cycle.auditor_name}
            </p>
            {cycle.scope && (
              <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                Scope: {cycle.scope}
              </p>
            )}
          </div>
          {cycle.is_closed && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '0.72rem',
                fontWeight: 600,
                padding: '4px 12px',
                borderRadius: 'var(--radius-full)',
                background: 'var(--color-pill-muted-bg)',
                color: 'var(--color-pill-muted-text)',
              }}
            >
              <Lock size={12} />
              Closed
            </span>
          )}
        </div>
      </div>

      {/* Auto discrepancy banner */}
      {flaggedCount > 0 && (
        <AlertBanner variant="amber">
          {flaggedCount} assets flagged – discrepancy report generated automatically
        </AlertBanner>
      )}

      {/* Checklist table */}
      {!cycle.items.length ? (
        <div className="card">
          <EmptyState
            title="No assets in this cycle"
            message="This audit cycle has no assets to verify."
            icon={<ClipboardCheck size={28} />}
          />
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
              <thead>
                <tr>
                  {['Asset', 'Expected location', 'Verification'].map((h: string) => (
                    <th
                      key={h}
                      style={{
                        textAlign: 'left',
                        padding: '12px 16px',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        color: 'var(--color-text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        borderBottom: '1px solid var(--color-border)',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cycle.items.map((item: AuditItem) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{item.asset_tag}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                        {item.asset_name}
                      </div>
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        fontSize: '0.82rem',
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      {item.expected_location || '—'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <VerificationToggle
                        status={item.status}
                        disabled={readOnly}
                        pending={
                          updateItemMut.isPending && updateItemMut.variables?.itemId === item.id
                        }
                        onChange={(status: ItemStatus) =>
                          updateItemMut.mutate({ itemId: item.id, status })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Close cycle */}
      {!cycle.is_closed && canManage && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={() => closeMut.mutate()}
            disabled={closeMut.isPending}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '11px 22px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: 'var(--color-accent-green)',
              color: '#fff',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: closeMut.isPending ? 'default' : 'pointer',
              opacity: closeMut.isPending ? 0.7 : 1,
            }}
          >
            <Lock size={14} />
            {closeMut.isPending ? 'Closing…' : 'Close audit cycle'}
          </button>
        </div>
      )}
    </div>
  )
}

/* ================================================================
   3-way verification toggle (StatusPill-style buttons)
   ================================================================ */
const TOGGLE_OPTIONS: { value: ItemStatus; label: string; bg: string; color: string; Icon: typeof CheckCircle2 }[] = [
  {
    value: 'verified',
    label: 'Verified',
    bg: 'var(--color-pill-green-bg)',
    color: 'var(--color-pill-green-text)',
    Icon: CheckCircle2,
  },
  {
    value: 'missing',
    label: 'Missing',
    bg: 'var(--color-pill-red-bg)',
    color: 'var(--color-pill-red-text)',
    Icon: HelpCircle,
  },
  {
    value: 'damaged',
    label: 'Damaged',
    bg: 'var(--color-pill-amber-bg)',
    color: 'var(--color-pill-amber-text)',
    Icon: AlertTriangle,
  },
]

function VerificationToggle({
  status,
  disabled,
  pending,
  onChange,
}: {
  status: ItemStatus
  disabled: boolean
  pending: boolean
  onChange: (status: ItemStatus) => void
}) {
  return (
    <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', opacity: pending ? 0.6 : 1 }}>
      {TOGGLE_OPTIONS.map((opt) => {
        const active = status === opt.value
        return (
          <button
            key={opt.value}
            disabled={disabled || pending}
            onClick={() => {
              if (!active) onChange(opt.value)
            }}
            title={opt.label}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 12px',
              borderRadius: 'var(--radius-full)',
              fontSize: '0.72rem',
              fontWeight: 600,
              letterSpacing: '0.02em',
              cursor: disabled ? 'default' : active ? 'default' : 'pointer',
              background: active ? opt.bg : 'transparent',
              color: active ? opt.color : 'var(--color-text-muted)',
              border: `1px solid ${active ? 'transparent' : 'var(--color-border)'}`,
              transition: 'all 0.12s ease',
            }}
            onMouseEnter={(e) => {
              if (!disabled && !active) e.currentTarget.style.background = 'var(--color-bg-hover)'
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.background = 'transparent'
            }}
          >
            <opt.Icon size={12} />
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
