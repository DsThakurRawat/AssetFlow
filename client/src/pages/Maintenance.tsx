import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { Plus, X, ArrowRight, Ban, Wrench } from 'lucide-react'
import { maintenanceAPI, assetsAPI } from '../lib/api'
import { useAuth } from '../lib/auth'
import StatusPill, { getStatusVariant } from '../components/StatusPill'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'

/* ================================================================
   Types
   ================================================================ */
type MaintStatus =
  | 'pending'
  | 'approved'
  | 'technician_assigned'
  | 'in_progress'
  | 'resolved'
  | 'rejected'

type Priority = 'low' | 'medium' | 'high' | 'critical'

interface MaintenanceCard {
  id: number
  asset_id: number
  asset_tag: string
  asset_name?: string | null
  issue: string
  priority: Priority
  status: MaintStatus
  technician_name: string | null
  raised_by_name: string | null
  resolution: string | null
  photo_url?: string | null
  created_at: string
  resolved_at: string | null
}

interface AssetRow {
  id: number
  tag: string
  name: string
  status: string
}

interface UpdatePayload {
  status: MaintStatus
  technician_name?: string
  resolution?: string
}

/* ================================================================
   Column config — EXACT order + labels
   ================================================================ */
const COLUMNS: { status: MaintStatus; label: string }[] = [
  { status: 'pending', label: 'Pending' },
  { status: 'approved', label: 'Approved' },
  { status: 'technician_assigned', label: 'Technician assigned' },
  { status: 'in_progress', label: 'In progress' },
  { status: 'resolved', label: 'Resolved' },
]

const NEXT_STATUS: Record<string, MaintStatus> = {
  pending: 'approved',
  approved: 'technician_assigned',
  technician_assigned: 'in_progress',
  in_progress: 'resolved',
}

const MANAGER_ROLES = ['admin', 'asset_manager']

/* ================================================================
   Page
   ================================================================ */
export default function Maintenance() {
  document.title = 'Maintenance — AssetFlow'

  const { user } = useAuth()
  const canManage = !!user && MANAGER_ROLES.includes(user.role)
  const queryClient = useQueryClient()

  const [searchParams, setSearchParams] = useSearchParams()
  const [showRaise, setShowRaise] = useState(false)

  // Deep-link from dashboard: /maintenance?action=raise
  useEffect(() => {
    if (searchParams.get('action') === 'raise') {
      setShowRaise(true)
      searchParams.delete('action')
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const requests = useQuery({
    queryKey: ['maintenance'],
    queryFn: () => maintenanceAPI.list().then((r) => r.data as MaintenanceCard[]),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdatePayload }) =>
      maintenanceAPI.update(id, { ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'kpis'] })
    },
  })

  // Group requests into columns by status; rejected go to a separate list.
  const { grouped, rejected } = useMemo(() => {
    const g: Record<string, MaintenanceCard[]> = {
      pending: [],
      approved: [],
      technician_assigned: [],
      in_progress: [],
      resolved: [],
    }
    const rej: MaintenanceCard[] = []
    for (const req of requests.data ?? []) {
      if (req.status === 'rejected') rej.push(req)
      else if (g[req.status]) g[req.status].push(req)
    }
    return { grouped: g, rejected: rej }
  }, [requests.data])

  return (
    <div className="animate-fade-in" style={{ maxWidth: 1280 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 24,
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
            Maintenance
          </h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.82rem', marginTop: 4 }}>
            Approval workflow as kanban board. Approving a card moves the asset to Under
            Maintenance; resolving returns it to Available.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowRaise(true)}>
          <Plus size={16} />
          Raise request
        </button>
      </div>

      {requests.isLoading ? (
        <LoadingState message="Loading maintenance requests…" />
      ) : requests.isError ? (
        <ErrorState onRetry={() => requests.refetch()} />
      ) : (
        <>
          {/* Kanban board */}
          <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${COLUMNS.length}, minmax(240px, 1fr))`,
                gap: 14,
                minWidth: 1120,
              }}
            >
              {COLUMNS.map((col) => (
                <Column
                  key={col.status}
                  label={col.label}
                  status={col.status}
                  cards={grouped[col.status]}
                  canManage={canManage}
                  onAdvance={(id: number, data: UpdatePayload) => updateMut.mutate({ id, data })}
                  isMutating={updateMut.isPending}
                />
              ))}
            </div>
          </div>

          {/* Rejected list */}
          {rejected.length > 0 && (
            <div className="card" style={{ marginTop: 24, padding: '16px 20px' }}>
              <h2
                style={{
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  marginBottom: 12,
                  color: 'var(--color-text-secondary)',
                }}
              >
                Rejected ({rejected.length})
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {rejected.map((req) => (
                  <div
                    key={req.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      fontSize: '0.8rem',
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    <StatusPill label="Rejected" variant="red" />
                    <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                      {req.asset_tag}
                    </span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {req.issue}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Raise request modal */}
      {showRaise && <RaiseRequestModal onClose={() => setShowRaise(false)} />}
    </div>
  )
}

/* ================================================================
   Column
   ================================================================ */
function Column({
  label,
  status,
  cards,
  canManage,
  onAdvance,
  isMutating,
}: {
  label: string
  status: MaintStatus
  cards: MaintenanceCard[]
  canManage: boolean
  onAdvance: (id: number, data: UpdatePayload) => void
  isMutating: boolean
}) {
  return (
    <div
      style={{
        background: 'var(--color-bg-sidebar)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        minHeight: 160,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '2px 4px',
        }}
      >
        <span
          style={{
            fontSize: '0.72rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--color-text-secondary)',
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: '0.7rem',
            fontWeight: 600,
            color: 'var(--color-text-muted)',
            background: 'var(--color-bg-hover)',
            borderRadius: 'var(--radius-full)',
            padding: '1px 8px',
          }}
        >
          {cards.length}
        </span>
      </div>

      {cards.length === 0 ? (
        <div
          style={{
            fontSize: '0.75rem',
            color: 'var(--color-text-muted)',
            textAlign: 'center',
            padding: '18px 8px',
          }}
        >
          No requests
        </div>
      ) : (
        cards.map((card) => (
          <Card
            key={card.id}
            card={card}
            status={status}
            canManage={canManage}
            onAdvance={onAdvance}
            isMutating={isMutating}
          />
        ))
      )}
    </div>
  )
}

/* ================================================================
   Card
   ================================================================ */
function Card({
  card,
  status,
  canManage,
  onAdvance,
  isMutating,
}: {
  card: MaintenanceCard
  status: MaintStatus
  canManage: boolean
  onAdvance: (id: number, data: UpdatePayload) => void
  isMutating: boolean
}) {
  // Inline prompt state: 'technician' | 'resolution' | null
  const [prompt, setPrompt] = useState<'technician' | 'resolution' | null>(null)
  const [promptValue, setPromptValue] = useState('')

  const next = NEXT_STATUS[status]
  const isResolved = status === 'resolved'

  const startAdvance = () => {
    if (!next) return
    if (next === 'technician_assigned') {
      setPromptValue(card.technician_name ?? '')
      setPrompt('technician')
    } else if (next === 'resolved') {
      setPromptValue('')
      setPrompt('resolution')
    } else {
      onAdvance(card.id, { status: next })
    }
  }

  const confirmPrompt = () => {
    if (!next) return
    const value = promptValue.trim()
    if (!value) return
    if (prompt === 'technician') {
      onAdvance(card.id, { status: next, technician_name: value })
    } else if (prompt === 'resolution') {
      onAdvance(card.id, { status: next, resolution: value })
    }
    setPrompt(null)
    setPromptValue('')
  }

  return (
    <div
      className="card animate-fade-in"
      style={{
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        borderColor: isResolved ? 'rgba(34, 197, 94, 0.35)' : 'var(--color-border)',
      }}
    >
      {/* Tag + priority */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{card.asset_tag}</span>
        <StatusPill label={card.priority} variant={getStatusVariant(card.priority)} />
      </div>

      {/* Issue */}
      <p
        style={{
          fontSize: '0.8rem',
          color: 'var(--color-text-secondary)',
          lineHeight: 1.4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
        title={card.issue}
      >
        {card.issue}
      </p>

      {/* Meta: technician / resolution / raised by */}
      {card.technician_name && (
        <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
          Tech: <span style={{ color: 'var(--color-text-secondary)' }}>{card.technician_name}</span>
        </div>
      )}
      {isResolved && card.resolution && (
        <div
          style={{
            fontSize: '0.72rem',
            color: 'var(--color-pill-green-text)',
            background: 'var(--color-pill-green-bg)',
            borderRadius: 'var(--radius-sm)',
            padding: '4px 8px',
          }}
        >
          {card.resolution}
          {card.resolved_at && (
            <span style={{ color: 'var(--color-text-muted)' }}>
              {' · '}
              {formatDate(card.resolved_at)}
            </span>
          )}
        </div>
      )}
      {card.raised_by_name && (
        <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>
          Raised by {card.raised_by_name}
        </div>
      )}

      {/* Inline prompt (technician name / resolution note) */}
      {prompt && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 }}>
          <input
            className="input"
            autoFocus
            style={{ padding: '7px 10px', fontSize: '0.78rem' }}
            placeholder={prompt === 'technician' ? 'Technician name' : 'Resolution note'}
            value={promptValue}
            onChange={(e) => setPromptValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirmPrompt()
              if (e.key === 'Escape') setPrompt(null)
            }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className="btn-primary"
              style={{ padding: '6px 12px', fontSize: '0.75rem', flex: 1, justifyContent: 'center' }}
              disabled={!promptValue.trim() || isMutating}
              onClick={confirmPrompt}
            >
              Confirm
            </button>
            <button
              className="btn-secondary"
              style={{ padding: '6px 12px', fontSize: '0.75rem' }}
              onClick={() => setPrompt(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Actions — manager only */}
      {canManage && next && !prompt && (
        <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
          <button
            className="btn-secondary"
            style={{ padding: '6px 12px', fontSize: '0.75rem', flex: 1, justifyContent: 'center' }}
            disabled={isMutating}
            onClick={startAdvance}
          >
            Advance
            <ArrowRight size={13} />
          </button>
          {status === 'pending' && (
            <button
              className="btn-secondary"
              style={{
                padding: '6px 12px',
                fontSize: '0.75rem',
                color: 'var(--color-pill-red-text)',
              }}
              disabled={isMutating}
              onClick={() => onAdvance(card.id, { status: 'rejected' })}
            >
              <Ban size={13} />
              Reject
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/* ================================================================
   Raise request modal
   ================================================================ */
function RaiseRequestModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [assetId, setAssetId] = useState('')
  const [issue, setIssue] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [photoUrl, setPhotoUrl] = useState('')
  const [error, setError] = useState('')

  const assets = useQuery({
    queryKey: ['assets', 'maintenance-select'],
    queryFn: () => assetsAPI.list().then((r) => r.data as AssetRow[]),
  })

  const createMut = useMutation({
    mutationFn: (data: Record<string, unknown>) => maintenanceAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'kpis'] })
      onClose()
    },
    onError: (err: unknown) => {
      if (isAxiosError(err)) setError(err.response?.data?.detail || 'Failed to raise request')
      else setError('Failed to raise request')
    },
  })

  const submit = () => {
    setError('')
    if (!assetId) {
      setError('Please select an asset')
      return
    }
    if (!issue.trim()) {
      setError('Please describe the issue')
      return
    }
    createMut.mutate({
      asset_id: Number(assetId),
      issue: issue.trim(),
      priority,
      photo_url: photoUrl.trim() || null,
    })
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        zIndex: 50,
      }}
    >
      <div
        className="card animate-fade-in"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 460, padding: '22px 24px' }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 18,
          }}
        >
          <h2 style={{ fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Wrench size={17} />
            Raise request
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: '8px 12px',
              marginBottom: 14,
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-pill-red-bg)',
              color: 'var(--color-pill-red-text)',
              fontSize: '0.8rem',
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Asset *">
            {assets.isLoading ? (
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Loading assets…</div>
            ) : assets.isError ? (
              <div style={{ fontSize: '0.8rem', color: 'var(--color-pill-red-text)' }}>
                Could not load assets
              </div>
            ) : (
              <select className="select" value={assetId} onChange={(e) => setAssetId(e.target.value)}>
                <option value="">Select an asset…</option>
                {(assets.data ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.tag} — {a.name}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <Field label="Issue *">
            <textarea
              className="input"
              value={issue}
              onChange={(e) => setIssue(e.target.value)}
              placeholder="Describe the problem…"
            />
          </Field>

          <Field label="Priority">
            <select
              className="select"
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </Field>

          <Field label="Photo URL (optional)">
            <input
              className="input"
              value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)}
              placeholder="https://…"
            />
          </Field>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={createMut.isPending}>
            {createMut.isPending ? 'Submitting…' : 'Submit request'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        style={{
          display: 'block',
          fontSize: '0.75rem',
          color: 'var(--color-text-muted)',
          marginBottom: 6,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  )
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
