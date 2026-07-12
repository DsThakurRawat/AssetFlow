import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import {
  assetsAPI, categoriesAPI, departmentsAPI,
  type Category, type Department,
} from '../lib/api'
import StatusPill, { getStatusVariant } from '../components/StatusPill'
import LoadingState from '../components/LoadingState'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import { Plus, Search, X, CheckCircle2, Wrench, ArrowRightLeft } from 'lucide-react'

/* ================================================================
   Types
   ================================================================ */
type AssetStatus =
  | 'available' | 'allocated' | 'under_maintenance'
  | 'retired' | 'lost' | 'disposed'
type AssetCondition = 'new' | 'good' | 'fair' | 'poor' | 'damaged'

interface Asset {
  id: number
  tag: string
  name: string
  serial_number: string | null
  category_id: number | null
  category_name: string | null
  cost: number | null
  acquisition_date: string | null
  condition: AssetCondition
  location: string | null
  photo_url: string | null
  is_bookable: boolean
  status: AssetStatus
}

interface AllocationRecord {
  allocated_to?: string | null
  allocated_by_name?: string | null
  allocated_at?: string | null
  expected_return_date?: string | null
  returned_at?: string | null
  return_condition?: string | null
  notes?: string | null
}

interface MaintenanceRecord {
  issue?: string | null
  priority?: string | null
  status?: string | null
  technician_name?: string | null
  resolution?: string | null
  created_at?: string | null
  resolved_at?: string | null
}

interface AssetDetail extends Asset {
  allocation_history: AllocationRecord[]
  maintenance_history: MaintenanceRecord[]
}

const STATUS_OPTIONS: AssetStatus[] = [
  'available', 'allocated', 'under_maintenance', 'retired', 'lost', 'disposed',
]
const CONDITION_OPTIONS: AssetCondition[] = ['new', 'good', 'fair', 'poor', 'damaged']

/* ================================================================
   Small helpers
   ================================================================ */
function humanize(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
}

function formatDate(value?: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.75rem',
  color: 'var(--color-text-muted)',
  marginBottom: 6,
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '12px 16px',
  fontSize: '0.72rem',
  fontWeight: 600,
  color: 'var(--color-text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  borderBottom: '1px solid var(--color-border)',
}

/* ================================================================
   Page
   ================================================================ */
export default function Assets() {
  document.title = 'Asset Registry — AssetFlow'

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('')
  const [department, setDepartment] = useState('')
  const [showRegister, setShowRegister] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  // Debounce the search input (~300ms) into the query key.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesAPI.list().then((r) => r.data),
  })
  const departmentsQuery = useQuery({
    queryKey: ['departments'],
    queryFn: () => departmentsAPI.list().then((r) => r.data),
  })

  const assetsQuery = useQuery({
    queryKey: ['assets', search, category, status, department],
    queryFn: () =>
      assetsAPI
        .list({
          search: search || undefined,
          category: category ? Number(category) : undefined,
          status: status || undefined,
          department: department ? Number(department) : undefined,
        })
        .then((r) => r.data as Asset[]),
  })

  const hasFilters = Boolean(search || category || status || department)
  const clearFilters = () => {
    setSearchInput('')
    setSearch('')
    setCategory('')
    setStatus('')
    setDepartment('')
  }

  return (
    <div className="animate-fade-in" style={{ maxWidth: 1200 }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
        gap: 16,
      }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
            Asset Registry
          </h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginTop: 4 }}>
            Central register &amp; searchable directory of all assets.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowRegister(true)}>
          <Plus size={16} />
          Register Asset
        </button>
      </div>

      {/* Search + filters */}
      <div className="card" style={{ padding: '18px 20px', marginBottom: 20 }}>
        <div style={{ position: 'relative', marginBottom: 14 }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: 14,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--color-text-muted)',
              pointerEvents: 'none',
            }}
          />
          <input
            className="input"
            style={{ paddingLeft: 40 }}
            placeholder="Search by tag, serial, or QR code.."
            value={searchInput}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchInput(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <select
            className="select"
            style={{ width: 'auto', minWidth: 170 }}
            value={category}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCategory(e.target.value)}
          >
            <option value="">All Categories</option>
            {(categoriesQuery.data || []).map((c: Category) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <select
            className="select"
            style={{ width: 'auto', minWidth: 170 }}
            value={status}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStatus(e.target.value)}
          >
            <option value="">All Statuses</option>
            {STATUS_OPTIONS.map((s: AssetStatus) => (
              <option key={s} value={s}>{humanize(s)}</option>
            ))}
          </select>

          <select
            className="select"
            style={{ width: 'auto', minWidth: 170 }}
            value={department}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setDepartment(e.target.value)}
          >
            <option value="">All Departments</option>
            {(departmentsQuery.data || []).map((d: Department) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>

          {hasFilters && (
            <button
              className="btn-secondary"
              style={{ padding: '8px 14px', fontSize: '0.78rem', marginLeft: 'auto' }}
              onClick={clearFilters}
            >
              <X size={13} />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {assetsQuery.isLoading ? (
        <div className="card"><LoadingState message="Loading assets…" /></div>
      ) : assetsQuery.isError ? (
        <div className="card">
          <ErrorState
            message="Could not load the asset directory."
            onRetry={() => assetsQuery.refetch()}
          />
        </div>
      ) : !assetsQuery.data?.length ? (
        <div className="card">
          <EmptyState
            title="No assets found"
            message={hasFilters
              ? 'Try adjusting your search or filters.'
              : 'Register your first asset to get started.'}
          />
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Tag', 'Name', 'Category', 'Status', 'Location'].map((h: string) => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {assetsQuery.data.map((a: Asset) => (
                  <tr
                    key={a.id}
                    onClick={() => setSelectedId(a.id)}
                    style={{
                      borderBottom: '1px solid var(--color-border)',
                      cursor: 'pointer',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e: React.MouseEvent<HTMLTableRowElement>) => {
                      e.currentTarget.style.background = 'var(--color-bg-hover)'
                    }}
                    onMouseLeave={(e: React.MouseEvent<HTMLTableRowElement>) => {
                      e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    <td style={{ padding: '12px 16px', fontSize: '0.82rem', fontWeight: 600, fontFamily: 'monospace' }}>
                      {a.tag}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '0.85rem', fontWeight: 500 }}>
                      {a.name}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
                      {a.category_name || '—'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <StatusPill label={humanize(a.status)} variant={getStatusVariant(a.status)} />
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
                      {a.location || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showRegister && (
        <RegisterAssetModal
          categories={categoriesQuery.data || []}
          onClose={() => setShowRegister(false)}
        />
      )}

      {selectedId != null && (
        <AssetDetailDrawer id={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  )
}

/* ================================================================
   Register Asset modal
   ================================================================ */
interface CreatedAsset { tag: string; name: string }

function RegisterAssetModal({
  categories,
  onClose,
}: {
  categories: Category[]
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    name: '',
    category_id: '',
    serial_number: '',
    acquisition_date: '',
    cost: '',
    condition: 'good' as AssetCondition,
    location: '',
    photo_url: '',
    is_bookable: false,
  })
  const [error, setError] = useState('')
  const [created, setCreated] = useState<CreatedAsset | null>(null)

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const createMut = useMutation({
    mutationFn: () =>
      assetsAPI
        .create({
          name: form.name.trim(),
          category_id: form.category_id ? Number(form.category_id) : null,
          serial_number: form.serial_number.trim() || null,
          cost: form.cost ? Number(form.cost) : null,
          acquisition_date: form.acquisition_date || null,
          condition: form.condition,
          location: form.location.trim() || null,
          photo_url: form.photo_url.trim() || null,
          is_bookable: form.is_bookable,
        })
        .then((r) => r.data as Asset),
    onSuccess: (data: Asset) => {
      setError('')
      setCreated({ tag: data.tag, name: data.name })
      queryClient.invalidateQueries({ queryKey: ['assets'] })
    },
    onError: (err: unknown) => {
      if (isAxiosError(err)) setError(err.response?.data?.detail || 'Failed to register asset.')
      else setError('Failed to register asset.')
    },
  })

  return (
    <ModalShell title={created ? 'Asset Registered' : 'Register Asset'} onClose={onClose}>
      {created ? (
        <div style={{ textAlign: 'center', padding: '12px 4px' }}>
          <CheckCircle2 size={40} style={{ color: 'var(--color-accent-green)', margin: '0 auto 12px' }} />
          <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', marginBottom: 8 }}>
            <strong>{created.name}</strong> was registered.
          </p>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: 6 }}>
            Auto-generated asset tag
          </p>
          <div style={{
            display: 'inline-block',
            padding: '8px 18px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-pill-green-bg)',
            color: 'var(--color-pill-green-text)',
            fontFamily: 'monospace',
            fontSize: '1.1rem',
            fontWeight: 700,
            letterSpacing: '0.04em',
          }}>
            {created.tag}
          </div>
          <div style={{ marginTop: 20 }}>
            <button className="btn-primary" onClick={onClose} style={{ width: '100%', justifyContent: 'center' }}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={(e: React.FormEvent) => { e.preventDefault(); createMut.mutate() }}
        >
          {error && (
            <div style={{
              padding: '8px 12px',
              marginBottom: 14,
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-pill-red-bg)',
              color: 'var(--color-pill-red-text)',
              fontSize: '0.8rem',
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Name *</label>
              <input
                className="input"
                value={form.name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('name', e.target.value)}
                placeholder="e.g. Dell Latitude 5540"
              />
            </div>

            <div>
              <label style={labelStyle}>Category</label>
              <select
                className="select"
                value={form.category_id}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => set('category_id', e.target.value)}
              >
                <option value="">Select category</option>
                {categories.map((c: Category) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Serial Number</label>
              <input
                className="input"
                value={form.serial_number}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('serial_number', e.target.value)}
                placeholder="Optional"
              />
            </div>

            <div>
              <label style={labelStyle}>Acquisition Date</label>
              <input
                className="input"
                type="date"
                value={form.acquisition_date}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('acquisition_date', e.target.value)}
              />
            </div>

            <div>
              <label style={labelStyle}>Acquisition Cost</label>
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={form.cost}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('cost', e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div>
              <label style={labelStyle}>Condition</label>
              <select
                className="select"
                value={form.condition}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  set('condition', e.target.value as AssetCondition)}
              >
                {CONDITION_OPTIONS.map((c: AssetCondition) => (
                  <option key={c} value={c}>{humanize(c)}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Location</label>
              <input
                className="input"
                value={form.location}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('location', e.target.value)}
                placeholder="e.g. HQ floor 2"
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Photo URL</label>
              <input
                className="input"
                value={form.photo_url}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('photo_url', e.target.value)}
                placeholder="https://…"
              />
            </div>

            <label style={{
              gridColumn: '1 / -1',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: '0.85rem',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={form.is_bookable}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('is_bookable', e.target.checked)}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              Shared / bookable asset
            </label>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={!form.name.trim() || createMut.isPending}
            >
              {createMut.isPending ? 'Registering…' : 'Register Asset'}
            </button>
          </div>
        </form>
      )}
    </ModalShell>
  )
}

/* ================================================================
   Asset detail drawer
   ================================================================ */
function AssetDetailDrawer({ id, onClose }: { id: number; onClose: () => void }) {
  const detailQuery = useQuery({
    queryKey: ['asset', id],
    queryFn: () => assetsAPI.get(id).then((r) => r.data as AssetDetail),
  })

  const asset = detailQuery.data

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 100,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      <div
        className="animate-slide-in"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        style={{
          width: 'min(460px, 100%)',
          height: '100%',
          background: 'var(--color-bg-card)',
          borderLeft: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-lg)',
          overflowY: 'auto',
          padding: '22px 24px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>
              {asset ? asset.name : 'Asset detail'}
            </h2>
            {asset && (
              <div style={{
                fontFamily: 'monospace',
                fontSize: '0.8rem',
                color: 'var(--color-text-muted)',
                marginTop: 4,
              }}>
                {asset.tag}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {detailQuery.isLoading ? (
          <LoadingState message="Loading asset…" />
        ) : detailQuery.isError || !asset ? (
          <ErrorState message="Could not load this asset." onRetry={() => detailQuery.refetch()} />
        ) : (
          <DrawerBody asset={asset} />
        )}
      </div>
    </div>
  )
}

function DrawerBody({ asset }: { asset: AssetDetail }) {
  const meta = useMemo(() => ([
    { label: 'Category', value: asset.category_name || '—' },
    { label: 'Serial Number', value: asset.serial_number || '—' },
    { label: 'Condition', value: humanize(asset.condition) },
    { label: 'Location', value: asset.location || '—' },
    { label: 'Cost', value: asset.cost != null ? String(asset.cost) : '—' },
    { label: 'Acquired', value: formatDate(asset.acquisition_date) },
    { label: 'Bookable', value: asset.is_bookable ? 'Yes' : 'No' },
  ]), [asset])

  return (
    <>
      {/* Lifecycle status badge */}
      <div style={{ marginBottom: 18 }}>
        <StatusPill label={humanize(asset.status)} variant={getStatusVariant(asset.status)} />
      </div>

      {/* Meta grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 14,
        marginBottom: 24,
        paddingBottom: 22,
        borderBottom: '1px solid var(--color-border)',
      }}>
        {meta.map((m: { label: string; value: string }) => (
          <div key={m.label}>
            <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginBottom: 3 }}>
              {m.label}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-primary)' }}>
              {m.value}
            </div>
          </div>
        ))}
      </div>

      {/* Allocation history */}
      <HistorySection
        title="Allocation History"
        icon={<ArrowRightLeft size={15} />}
        empty="No allocations yet."
        count={asset.allocation_history?.length || 0}
      >
        {(asset.allocation_history || []).map((rec: AllocationRecord, i: number) => (
          <div key={i} style={cardRowStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                {rec.allocated_to || 'Unknown'}
              </span>
              <StatusPill
                label={rec.returned_at ? 'Returned' : 'Active'}
                variant={rec.returned_at ? 'muted' : 'blue'}
              />
            </div>
            <MetaLine label="Allocated" value={formatDate(rec.allocated_at)} />
            {rec.allocated_by_name && <MetaLine label="By" value={rec.allocated_by_name} />}
            <MetaLine label="Expected return" value={formatDate(rec.expected_return_date)} />
            {rec.returned_at && <MetaLine label="Returned" value={formatDate(rec.returned_at)} />}
            {rec.return_condition && <MetaLine label="Return condition" value={humanize(rec.return_condition)} />}
            {rec.notes && <MetaLine label="Notes" value={rec.notes} />}
          </div>
        ))}
      </HistorySection>

      {/* Maintenance history */}
      <HistorySection
        title="Maintenance History"
        icon={<Wrench size={15} />}
        empty="No maintenance records yet."
        count={asset.maintenance_history?.length || 0}
      >
        {(asset.maintenance_history || []).map((rec: MaintenanceRecord, i: number) => (
          <div key={i} style={cardRowStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                {rec.issue || 'Issue'}
              </span>
              {rec.status && (
                <StatusPill label={humanize(rec.status)} variant={getStatusVariant(rec.status)} />
              )}
            </div>
            {rec.priority && <MetaLine label="Priority" value={humanize(rec.priority)} />}
            {rec.technician_name && <MetaLine label="Technician" value={rec.technician_name} />}
            <MetaLine label="Reported" value={formatDate(rec.created_at)} />
            {rec.resolved_at && <MetaLine label="Resolved" value={formatDate(rec.resolved_at)} />}
            {rec.resolution && <MetaLine label="Resolution" value={rec.resolution} />}
          </div>
        ))}
      </HistorySection>
    </>
  )
}

const cardRowStyle: React.CSSProperties = {
  background: 'var(--color-bg-input)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  padding: '12px 14px',
  marginBottom: 10,
}

function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: '0.78rem', marginTop: 2 }}>
      <span style={{ color: 'var(--color-text-muted)', minWidth: 110 }}>{label}</span>
      <span style={{ color: 'var(--color-text-secondary)' }}>{value}</span>
    </div>
  )
}

function HistorySection({
  title, icon, empty, count, children,
}: {
  title: string
  icon: React.ReactNode
  empty: string
  count: number
  children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ color: 'var(--color-text-muted)' }}>{icon}</span>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 600 }}>{title}</h3>
        <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>({count})</span>
      </div>
      {count === 0 ? (
        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{empty}</p>
      ) : (
        children
      )}
    </div>
  )
}

/* ================================================================
   Modal shell
   ================================================================ */
function ModalShell({
  title, onClose, children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '48px 16px',
        overflowY: 'auto',
      }}
    >
      <div
        className="card animate-fade-in"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        style={{ width: 'min(560px, 100%)', padding: '22px 24px' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 700 }}>{title}</h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
