import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import {
  assetsAPI, allocationsAPI, transfersAPI, usersAPI, departmentsAPI,
  type User, type Department,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import StatusPill, { getStatusVariant } from '../components/StatusPill'
import AlertBanner from '../components/AlertBanner'
import LoadingState from '../components/LoadingState'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import {
  Search, Package, ArrowLeftRight, User as UserIcon, Building2,
  Check, X, RotateCcw, History, CheckCircle2,
} from 'lucide-react'

/* ---------------------------------------------------------------- types --- */
interface Asset {
  id: number
  tag: string
  name: string
  status: string
  serial_number?: string | null
  category_name?: string | null
  current_holder_name?: string | null
  current_holder_type?: 'employee' | 'department' | null
}

interface AllocationHistoryRow {
  id: number
  allocated_to: string | null
  allocated_by_name: string | null
  allocated_at: string
  expected_return_date: string | null
  returned_at: string | null
  return_condition: string | null
  notes: string | null
}

interface AssetDetail extends Asset {
  allocation_history: AllocationHistoryRow[]
}

interface ConflictInfo {
  holder_name: string
  holder_context: string
}

interface TransferResult {
  id: number
  status: string
  to_employee_name?: string | null
  asset_tag?: string | null
}

type TargetKind = 'employee' | 'department'
type ReturnCondition = 'new' | 'good' | 'fair' | 'poor' | 'damaged'

const RETURN_CONDITIONS: ReturnCondition[] = ['new', 'good', 'fair', 'poor', 'damaged']

/* ------------------------------------------------------------- helpers --- */
function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.72rem',
  fontWeight: 600,
  color: 'var(--color-text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 6,
}

const sectionTitleStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: '0.95rem',
  fontWeight: 700,
  color: 'var(--color-text-primary)',
  marginBottom: 16,
}

/* ================================================================ page === */
export default function Allocation() {
  document.title = 'Allocation & Transfer — AssetFlow'
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const isManager = !!user && ['admin', 'asset_manager', 'dept_head'].includes(user.role)

  // ---- picker state ----
  const [search, setSearch] = useState('')
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null)

  // ---- allocate form state ----
  const [targetKind, setTargetKind] = useState<TargetKind>('employee')
  const [employeeId, setEmployeeId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [expectedReturn, setExpectedReturn] = useState('')
  const [allocNotes, setAllocNotes] = useState('')
  const [allocError, setAllocError] = useState('')

  // ---- conflict / transfer state ----
  const [conflict, setConflict] = useState<ConflictInfo | null>(null)
  const [transferTo, setTransferTo] = useState('')
  const [transferReason, setTransferReason] = useState('')
  const [transferError, setTransferError] = useState('')
  const [transferResult, setTransferResult] = useState<TransferResult | null>(null)
  const [decisionMsg, setDecisionMsg] = useState('')

  // ---- return flow state ----
  const [showReturn, setShowReturn] = useState(false)
  const [returnCondition, setReturnCondition] = useState<ReturnCondition>('good')
  const [returnNotes, setReturnNotes] = useState('')

  // ---- data ----
  const assetsQuery = useQuery({
    queryKey: ['assets', 'allocation-picker', search],
    queryFn: () => assetsAPI.list(search ? { search } : undefined).then((r) => r.data as Asset[]),
  })

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => usersAPI.list().then((r) => r.data),
  })

  const departmentsQuery = useQuery({
    queryKey: ['departments'],
    queryFn: () => departmentsAPI.list().then((r) => r.data),
  })

  const detailQuery = useQuery({
    queryKey: ['asset-detail', selectedAssetId],
    queryFn: () => assetsAPI.get(selectedAssetId as number).then((r) => r.data as AssetDetail),
    enabled: selectedAssetId !== null,
  })

  const detail = detailQuery.data
  const activeUsers: User[] = (usersQuery.data || []).filter((u: User) => u.is_active)
  const activeDepts: Department[] = (departmentsQuery.data || []).filter((d: Department) => d.is_active)

  // Reset every dependent form when the selected asset changes.
  useEffect(() => {
    setTargetKind('employee')
    setEmployeeId('')
    setDepartmentId('')
    setExpectedReturn('')
    setAllocNotes('')
    setAllocError('')
    setConflict(null)
    setTransferTo('')
    setTransferReason('')
    setTransferError('')
    setTransferResult(null)
    setDecisionMsg('')
    setShowReturn(false)
    setReturnCondition('good')
    setReturnNotes('')
  }, [selectedAssetId])

  // ---- mutations ----
  const allocateMut = useMutation({
    mutationFn: (payload: Record<string, unknown>) => allocationsAPI.create(payload),
    onSuccess: () => {
      setAllocError('')
      setConflict(null)
      setEmployeeId('')
      setDepartmentId('')
      setExpectedReturn('')
      setAllocNotes('')
      queryClient.invalidateQueries({ queryKey: ['asset-detail', selectedAssetId] })
      queryClient.invalidateQueries({ queryKey: ['assets', 'allocation-picker'] })
    },
    onError: (err: unknown) => {
      if (isAxiosError(err) && err.response?.status === 409) {
        const body = err.response.data as ConflictInfo
        setConflict({ holder_name: body.holder_name, holder_context: body.holder_context })
        setAllocError('')
      } else if (isAxiosError(err)) {
        setAllocError(err.response?.data?.detail || 'Failed to allocate asset.')
      } else {
        setAllocError('Failed to allocate asset.')
      }
    },
  })

  const transferMut = useMutation({
    mutationFn: (payload: { asset_id: number; to_employee_id: number; reason: string }) =>
      transfersAPI.create(payload),
    onSuccess: (res) => {
      const data = res.data as TransferResult
      setTransferResult(data)
      setTransferError('')
      setTransferReason('')
      queryClient.invalidateQueries({ queryKey: ['asset-detail', selectedAssetId] })
    },
    onError: (err: unknown) => {
      if (isAxiosError(err)) setTransferError(err.response?.data?.detail || 'Failed to submit request.')
      else setTransferError('Failed to submit request.')
    },
  })

  const decideMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'approved' | 'rejected' }) =>
      transfersAPI.decide(id, { status }),
    onSuccess: (res, vars) => {
      const data = res.data as TransferResult
      setTransferResult((prev) => (prev ? { ...prev, status: data.status } : prev))
      setDecisionMsg(
        vars.status === 'approved'
          ? 'Transfer approved — asset re-allocated.'
          : 'Transfer request rejected.'
      )
      queryClient.invalidateQueries({ queryKey: ['asset-detail', selectedAssetId] })
      queryClient.invalidateQueries({ queryKey: ['assets', 'allocation-picker'] })
    },
    onError: () => setDecisionMsg('Failed to record decision.'),
  })

  const returnMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Record<string, unknown> }) =>
      allocationsAPI.return(id, payload),
    onSuccess: () => {
      setShowReturn(false)
      setReturnNotes('')
      setReturnCondition('good')
      queryClient.invalidateQueries({ queryKey: ['asset-detail', selectedAssetId] })
      queryClient.invalidateQueries({ queryKey: ['assets', 'allocation-picker'] })
    },
  })

  // ---- derived ----
  const history: AllocationHistoryRow[] = detail?.allocation_history || []
  const activeAllocation = useMemo(
    () => history.find((h: AllocationHistoryRow) => h.returned_at === null) || null,
    [history]
  )

  // The conflict shown to the user is either a live 409 body OR the current
  // holder of an already-allocated asset (direct re-allocation is blocked).
  const effectiveConflict: ConflictInfo | null = useMemo(() => {
    if (conflict) return conflict
    if (detail && detail.status === 'allocated') {
      const holderName = detail.current_holder_name || activeAllocation?.allocated_to || 'Unknown'
      let context = 'Unknown'
      if (detail.current_holder_type === 'department') {
        context = 'Department'
      } else {
        const match = activeUsers.find((u: User) => u.name === holderName)
        context = match?.department_name || 'Unassigned'
      }
      return { holder_name: holderName, holder_context: context }
    }
    return null
  }, [conflict, detail, activeAllocation, activeUsers])

  const showAllocateForm = detail?.status === 'available'

  // ---- handlers ----
  const handleAllocate = (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedAssetId === null) return
    setAllocError('')
    const payload: Record<string, unknown> = { asset_id: selectedAssetId }
    if (targetKind === 'employee') {
      if (!employeeId) { setAllocError('Select an employee.'); return }
      payload.employee_id = Number(employeeId)
    } else {
      if (!departmentId) { setAllocError('Select a department.'); return }
      payload.department_id = Number(departmentId)
    }
    if (expectedReturn) payload.expected_return_date = expectedReturn
    if (allocNotes.trim()) payload.notes = allocNotes.trim()
    allocateMut.mutate(payload)
  }

  const handleTransfer = (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedAssetId === null) return
    setTransferError('')
    if (!transferTo) { setTransferError('Select an employee to transfer to.'); return }
    transferMut.mutate({
      asset_id: selectedAssetId,
      to_employee_id: Number(transferTo),
      reason: transferReason.trim(),
    })
  }

  const handleReturn = (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeAllocation) return
    returnMut.mutate({
      id: activeAllocation.id,
      payload: { return_condition: returnCondition, notes: returnNotes.trim() || undefined },
    })
  }

  /* ------------------------------------------------------------- render --- */
  return (
    <div className="animate-fade-in" style={{ maxWidth: 860 }}>
      {/* Header */}
      <div style={{ marginBottom: 6 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
          Allocation &amp; Transfer
        </h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginTop: 4 }}>
          Manage who holds what — the double-allocation block in action.
        </p>
      </div>

      {/* ------------------------------------------------- Asset picker --- */}
      <div className="card" style={{ padding: 20, marginTop: 20 }}>
        <div style={sectionTitleStyle}>
          <Package size={18} /> Asset
        </div>

        <div style={{ position: 'relative', marginBottom: 14 }}>
          <Search
            size={16}
            style={{
              position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--color-text-muted)', pointerEvents: 'none',
            }}
          />
          <input
            className="input"
            style={{ paddingLeft: 36 }}
            placeholder="Search assets by tag, name or serial…"
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
          />
        </div>

        {assetsQuery.isLoading ? (
          <LoadingState message="Loading assets…" />
        ) : assetsQuery.isError ? (
          <ErrorState message="Could not load assets." onRetry={() => assetsQuery.refetch()} />
        ) : !assetsQuery.data?.length ? (
          <EmptyState title="No assets found" message="Try a different search term." />
        ) : (
          <div
            style={{
              display: 'flex', flexDirection: 'column', gap: 4,
              maxHeight: 260, overflowY: 'auto',
            }}
          >
            {assetsQuery.data.map((a: Asset) => {
              const selected = a.id === selectedAssetId
              return (
                <button
                  key={a.id}
                  onClick={() => setSelectedAssetId(a.id)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 12, textAlign: 'left', width: '100%',
                    padding: '10px 12px', borderRadius: 'var(--radius-sm)',
                    border: `1px solid ${selected ? 'var(--color-accent-green)' : 'transparent'}`,
                    background: selected ? 'rgba(34, 197, 94, 0.08)' : 'transparent',
                    color: 'var(--color-text-primary)', cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!selected) e.currentTarget.style.background = 'var(--color-bg-hover)'
                  }}
                  onMouseLeave={(e) => {
                    if (!selected) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                      {a.tag} — {a.name}
                    </span>
                    {a.current_holder_name && (
                      <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                        Held by {a.current_holder_name}
                      </span>
                    )}
                  </span>
                  <StatusPill label={a.status} variant={getStatusVariant(a.status)} />
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* --------------------------------------------- Selected asset --- */}
      {selectedAssetId !== null && (
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {detailQuery.isLoading ? (
            <div className="card" style={{ padding: 20 }}><LoadingState /></div>
          ) : detailQuery.isError || !detail ? (
            <div className="card" style={{ padding: 20 }}>
              <ErrorState message="Could not load asset details." onRetry={() => detailQuery.refetch()} />
            </div>
          ) : (
            <>
              {/* Current status */}
              <div className="card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: '1rem', fontWeight: 700 }}>
                      {detail.tag} — {detail.name}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                      {detail.category_name || 'Uncategorised'}
                      {detail.current_holder_name ? ` · Held by ${detail.current_holder_name}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>Status</span>
                    <StatusPill label={detail.status} variant={getStatusVariant(detail.status)} />
                  </div>
                </div>
              </div>

              {/* ---- Allocate form (Available only) ---- */}
              {showAllocateForm && (
                <div className="card" style={{ padding: 20 }}>
                  <div style={sectionTitleStyle}>
                    <UserIcon size={18} /> Allocate asset
                  </div>

                  <form onSubmit={handleAllocate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Target toggle */}
                    <div>
                      <label style={labelStyle}>Allocate to</label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {(['employee', 'department'] as TargetKind[]).map((kind) => {
                          const active = targetKind === kind
                          const Icon = kind === 'employee' ? UserIcon : Building2
                          return (
                            <button
                              key={kind}
                              type="button"
                              onClick={() => setTargetKind(kind)}
                              style={{
                                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                gap: 8, padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                                border: `1px solid ${active ? 'var(--color-accent-green)' : 'var(--color-border-light)'}`,
                                background: active ? 'rgba(34, 197, 94, 0.12)' : 'transparent',
                                color: active ? 'var(--color-accent-green)' : 'var(--color-text-secondary)',
                                fontSize: '0.82rem', fontWeight: active ? 600 : 400, cursor: 'pointer',
                                textTransform: 'capitalize', transition: 'all 0.15s ease',
                              }}
                            >
                              <Icon size={15} /> {kind}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Target select */}
                    {targetKind === 'employee' ? (
                      <div>
                        <label style={labelStyle}>Employee</label>
                        <select
                          className="select"
                          value={employeeId}
                          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEmployeeId(e.target.value)}
                        >
                          <option value="">Select employee…</option>
                          {activeUsers.map((u: User) => (
                            <option key={u.id} value={u.id}>
                              {u.name}{u.department_name ? ` — ${u.department_name}` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div>
                        <label style={labelStyle}>Department</label>
                        <select
                          className="select"
                          value={departmentId}
                          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setDepartmentId(e.target.value)}
                        >
                          <option value="">Select department…</option>
                          {activeDepts.map((d: Department) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div>
                      <label style={labelStyle}>Expected return date (optional)</label>
                      <input
                        className="input"
                        type="date"
                        value={expectedReturn}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExpectedReturn(e.target.value)}
                      />
                    </div>

                    <div>
                      <label style={labelStyle}>Notes (optional)</label>
                      <textarea
                        className="input"
                        placeholder="Add any context for this allocation…"
                        value={allocNotes}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setAllocNotes(e.target.value)}
                      />
                    </div>

                    {allocError && <AlertBanner variant="red">{allocError}</AlertBanner>}

                    <div>
                      <button type="submit" className="btn-primary" disabled={allocateMut.isPending}>
                        <Check size={16} />
                        {allocateMut.isPending ? 'Allocating…' : 'Allocate'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* ---- Conflict banner + Transfer request (money shot) ---- */}
              {effectiveConflict && (
                <div className="card" style={{ padding: 20 }}>
                  <AlertBanner variant="red">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontWeight: 700 }}>
                        Already Allocated to {effectiveConflict.holder_name} ({effectiveConflict.holder_context})
                      </span>
                      <span style={{ fontWeight: 500, opacity: 0.95 }}>
                        Direct re-allocation is blocked – submit a transfer request below
                      </span>
                    </div>
                  </AlertBanner>

                  <div style={{ ...sectionTitleStyle, marginTop: 20 }}>
                    <ArrowLeftRight size={18} /> Transfer Request
                  </div>

                  <form onSubmit={handleTransfer} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                      <label style={labelStyle}>From</label>
                      <input className="input" value={effectiveConflict.holder_name} readOnly disabled />
                    </div>

                    <div>
                      <label style={labelStyle}>To</label>
                      <select
                        className="select"
                        value={transferTo}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTransferTo(e.target.value)}
                      >
                        <option value="">Select Employee….</option>
                        {activeUsers
                          .filter((u: User) => u.name !== effectiveConflict.holder_name)
                          .map((u: User) => (
                            <option key={u.id} value={u.id}>
                              {u.name}{u.department_name ? ` — ${u.department_name}` : ''}
                            </option>
                          ))}
                      </select>
                    </div>

                    <div>
                      <label style={labelStyle}>Reason</label>
                      <textarea
                        className="input"
                        placeholder="Why should this asset be transferred?"
                        value={transferReason}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTransferReason(e.target.value)}
                      />
                    </div>

                    {transferError && <AlertBanner variant="red">{transferError}</AlertBanner>}

                    {!transferResult && (
                      <div>
                        <button type="submit" className="btn-primary" disabled={transferMut.isPending}>
                          <ArrowLeftRight size={16} />
                          {transferMut.isPending ? 'Submitting…' : 'Submit Request'}
                        </button>
                      </div>
                    )}
                  </form>

                  {/* Transfer success + approve / reject */}
                  {transferResult && (
                    <div
                      style={{
                        marginTop: 16, padding: 16, borderRadius: 'var(--radius-md)',
                        background: 'rgba(34, 197, 94, 0.08)',
                        border: '1px solid rgba(34, 197, 94, 0.25)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-accent-green)', fontSize: '0.85rem', fontWeight: 600 }}>
                        <CheckCircle2 size={16} />
                        Transfer request #{transferResult.id} submitted
                        {transferResult.to_employee_name ? ` — to ${transferResult.to_employee_name}` : ''}.
                      </div>

                      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Status</span>
                        <StatusPill label={transferResult.status} variant={getStatusVariant(transferResult.status)} />
                      </div>

                      {isManager && transferResult.status === 'requested' && (
                        <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
                          <button
                            className="btn-primary"
                            style={{ padding: '8px 16px', fontSize: '0.8rem' }}
                            disabled={decideMut.isPending}
                            onClick={() => decideMut.mutate({ id: transferResult.id, status: 'approved' })}
                          >
                            <Check size={14} /> Approve
                          </button>
                          <button
                            className="btn-danger"
                            style={{ padding: '8px 16px', fontSize: '0.8rem' }}
                            disabled={decideMut.isPending}
                            onClick={() => decideMut.mutate({ id: transferResult.id, status: 'rejected' })}
                          >
                            <X size={14} /> Reject
                          </button>
                        </div>
                      )}

                      {decisionMsg && (
                        <div style={{ marginTop: 12, fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                          {decisionMsg}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ---- Return flow ---- */}
              {activeAllocation && (
                <div className="card" style={{ padding: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div style={sectionTitleStyle}>
                      <RotateCcw size={18} /> Return
                    </div>
                    {!showReturn && (
                      <button
                        className="btn-secondary"
                        style={{ padding: '8px 16px', fontSize: '0.8rem' }}
                        onClick={() => setShowReturn(true)}
                      >
                        <RotateCcw size={14} /> Mark returned
                      </button>
                    )}
                  </div>

                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                    Currently held by {activeAllocation.allocated_to || 'Unknown'} · allocated {formatDate(activeAllocation.allocated_at)}
                    {activeAllocation.expected_return_date ? ` · due ${formatDate(activeAllocation.expected_return_date)}` : ''}
                  </div>

                  {showReturn && (
                    <form onSubmit={handleReturn} style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <div>
                        <label style={labelStyle}>Return condition</label>
                        <select
                          className="select"
                          value={returnCondition}
                          onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                            setReturnCondition(e.target.value as ReturnCondition)}
                        >
                          {RETURN_CONDITIONS.map((c: ReturnCondition) => (
                            <option key={c} value={c} style={{ textTransform: 'capitalize' }}>{c}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Check-in notes (optional)</label>
                        <textarea
                          className="input"
                          placeholder="Note any damage or observations…"
                          value={returnNotes}
                          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setReturnNotes(e.target.value)}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button type="submit" className="btn-primary" disabled={returnMut.isPending}>
                          <Check size={16} />
                          {returnMut.isPending ? 'Saving…' : 'Confirm return'}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => setShowReturn(false)}
                        >
                          Cancel
                        </button>
                      </div>
                      {returnMut.isError && (
                        <AlertBanner variant="red">
                          {isAxiosError(returnMut.error)
                            ? (returnMut.error.response?.data?.detail || 'Failed to record return.')
                            : 'Failed to record return.'}
                        </AlertBanner>
                      )}
                    </form>
                  )}
                </div>
              )}

              {/* ---- Allocation history ---- */}
              <div className="card" style={{ padding: 20 }}>
                <div style={sectionTitleStyle}>
                  <History size={18} /> Allocation history
                </div>

                {!history.length ? (
                  <EmptyState title="No history yet" message="This asset has never been allocated." />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {history.map((row: AllocationHistoryRow, idx: number) => {
                      const returned = row.returned_at !== null
                      return (
                        <div
                          key={row.id}
                          style={{
                            display: 'flex', gap: 14, padding: '14px 0',
                            borderBottom: idx < history.length - 1 ? '1px solid var(--color-border)' : 'none',
                          }}
                        >
                          <div
                            style={{
                              width: 8, height: 8, borderRadius: '50%', marginTop: 6, flexShrink: 0,
                              background: returned ? 'var(--color-text-muted)' : 'var(--color-accent-green)',
                            }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                              {returned
                                ? `Returned – condition: ${row.return_condition || 'unspecified'}`
                                : `Allocated to ${row.allocated_to || 'Unknown'}`}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 3 }}>
                              {returned
                                ? `${row.allocated_to || 'Unknown'} · returned ${formatDate(row.returned_at)}`
                                : `Allocated ${formatDate(row.allocated_at)}${row.allocated_by_name ? ` by ${row.allocated_by_name}` : ''}${row.expected_return_date ? ` · due ${formatDate(row.expected_return_date)}` : ''}`}
                            </div>
                            {row.notes && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: 4, fontStyle: 'italic' }}>
                                “{row.notes}”
                              </div>
                            )}
                          </div>
                          {!returned && (
                            <StatusPill label="Active" variant="blue" />
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Nothing selected */}
      {selectedAssetId === null && (
        <div className="card" style={{ padding: 8, marginTop: 20 }}>
          <EmptyState
            icon={<ArrowLeftRight size={28} />}
            title="Select an asset"
            message="Pick an asset above to allocate, transfer, or review its allocation history."
          />
        </div>
      )}
    </div>
  )
}
