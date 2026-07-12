import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import {
  departmentsAPI, categoriesAPI, usersAPI,
  type Department, type User, type Category,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import PillTabs from '../components/PillTabs'
import StatusPill from '../components/StatusPill'
import LoadingState from '../components/LoadingState'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import { Plus, Edit2, X, Check } from 'lucide-react'

type Tab = 'Departments' | 'Categories' | 'Employee'

export default function OrgSetup() {
  document.title = 'Organization Setup — AssetFlow'
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<Tab>('Departments')
  const [showAddForm, setShowAddForm] = useState(false)

  // Redirect non-admins
  if (user?.role !== 'admin') {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 8 }}>Access Restricted</h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
          Only administrators can access Organization Setup.
        </p>
      </div>
    )
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
          Organization Setup
        </h1>
        <span style={{
          fontSize: '0.72rem',
          padding: '4px 12px',
          borderRadius: 'var(--radius-full)',
          background: 'rgba(139, 92, 246, 0.15)',
          color: '#a78bfa',
          fontWeight: 600,
        }}>
          Admin only
        </span>
      </div>

      <div style={{ marginBottom: 24 }}>
        <PillTabs
          tabs={['Departments', 'Categories', 'Employee']}
          activeTab={activeTab}
          onTabChange={(t) => {
            setActiveTab(t as Tab)
            setShowAddForm(false)
          }}
          trailing={
            <button
              className="btn-primary"
              style={{ padding: '8px 16px', fontSize: '0.8rem' }}
              onClick={() => setShowAddForm(!showAddForm)}
            >
              <Plus size={14} />
              Add
            </button>
          }
        />
      </div>

      {activeTab === 'Departments' && (
        <DepartmentsTab showAdd={showAddForm} onCloseAdd={() => setShowAddForm(false)} />
      )}
      {activeTab === 'Categories' && (
        <CategoriesTab showAdd={showAddForm} onCloseAdd={() => setShowAddForm(false)} />
      )}
      {activeTab === 'Employee' && (
        <EmployeeTab />
      )}
    </div>
  )
}

/* ================================================================
   DEPARTMENTS TAB
   ================================================================ */
function DepartmentsTab({ showAdd, onCloseAdd }: { showAdd: boolean; onCloseAdd: () => void }) {
  const queryClient = useQueryClient()
  const [editId, setEditId] = useState<number | null>(null)
  const [formError, setFormError] = useState('')

  const depts = useQuery({
    queryKey: ['departments'],
    queryFn: () => departmentsAPI.list().then(r => r.data),
  })

  const users = useQuery({
    queryKey: ['users'],
    queryFn: () => usersAPI.list().then(r => r.data),
  })

  const createMut = useMutation({
    mutationFn: (data: { name: string; parent_id?: number | null; head_user_id?: number | null }) =>
      departmentsAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] })
      onCloseAdd()
      setFormError('')
    },
    onError: (err) => {
      if (isAxiosError(err)) setFormError(err.response?.data?.detail || 'Failed to create')
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Department> }) =>
      departmentsAPI.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] })
      setEditId(null)
    },
  })

  if (depts.isLoading) return <LoadingState />
  if (depts.isError) return <ErrorState onRetry={() => depts.refetch()} />

  return (
    <>
      {/* Add Form */}
      {showAdd && (
        <AddDepartmentForm
          departments={depts.data || []}
          users={users.data || []}
          error={formError}
          loading={createMut.isPending}
          onSubmit={(data) => createMut.mutate(data)}
          onCancel={onCloseAdd}
        />
      )}

      {/* Table */}
      {!depts.data?.length ? (
        <EmptyState title="No departments" message="Create your first department to get started." />
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Department', 'Head', 'Parent Dept', 'Status', ''].map((h) => (
                  <th key={h} style={{
                    textAlign: 'left',
                    padding: '12px 16px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    color: 'var(--color-text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    borderBottom: '1px solid var(--color-border)',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {depts.data.map((dept) => (
                <tr
                  key={dept.id}
                  style={{
                    borderBottom: '1px solid var(--color-border)',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-bg-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '12px 16px', fontSize: '0.85rem', fontWeight: 500 }}>
                    {dept.name}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
                    {dept.head_name || '—'}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
                    {dept.parent_name || '—'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <StatusPill
                      label={dept.is_active ? 'Active' : 'Inactive'}
                      variant={dept.is_active ? 'green' : 'muted'}
                    />
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button
                        className="btn-secondary"
                        style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                        onClick={() => setEditId(dept.id === editId ? null : dept.id)}
                      >
                        <Edit2 size={12} />
                        Edit
                      </button>
                      <button
                        className="btn-secondary"
                        style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                        onClick={() => updateMut.mutate({
                          id: dept.id,
                          data: { is_active: !dept.is_active },
                        })}
                      >
                        {dept.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function AddDepartmentForm({
  departments,
  users,
  error,
  loading,
  onSubmit,
  onCancel,
}: {
  departments: Department[]
  users: User[]
  error: string
  loading: boolean
  onSubmit: (data: { name: string; parent_id?: number | null; head_user_id?: number | null }) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState<string>('')
  const [headId, setHeadId] = useState<string>('')

  return (
    <div className="card animate-fade-in" style={{ padding: '20px 24px', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 600 }}>Add Department</h3>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
          <X size={18} />
        </button>
      </div>
      {error && (
        <div style={{ padding: '8px 12px', marginBottom: 12, borderRadius: 'var(--radius-sm)', background: 'var(--color-pill-red-bg)', color: 'var(--color-pill-red-text)', fontSize: '0.8rem' }}>
          {error}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 12, alignItems: 'end' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: 4 }}>Name *</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Department name" />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: 4 }}>Parent Dept</label>
          <select className="select" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">None</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: 4 }}>Head</label>
          <select className="select" value={headId} onChange={(e) => setHeadId(e.target.value)}>
            <option value="">None</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <button
          className="btn-primary"
          disabled={!name.trim() || loading}
          onClick={() => onSubmit({
            name: name.trim(),
            parent_id: parentId ? Number(parentId) : null,
            head_user_id: headId ? Number(headId) : null,
          })}
          style={{ padding: '10px 20px' }}
        >
          {loading ? '…' : 'Create'}
        </button>
      </div>
    </div>
  )
}

/* ================================================================
   CATEGORIES TAB
   ================================================================ */
function CategoriesTab({ showAdd, onCloseAdd }: { showAdd: boolean; onCloseAdd: () => void }) {
  const queryClient = useQueryClient()
  const [formError, setFormError] = useState('')
  const [editCat, setEditCat] = useState<Category | null>(null)
  const [editError, setEditError] = useState('')

  const cats = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesAPI.list().then(r => r.data),
  })

  const createMut = useMutation({
    mutationFn: (data: { name: string; warranty_months?: number | null }) =>
      categoriesAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      onCloseAdd()
      setFormError('')
    },
    onError: (err) => {
      if (isAxiosError(err)) setFormError(err.response?.data?.detail || 'Failed to create')
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name: string; warranty_months?: number | null } }) =>
      categoriesAPI.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      setEditCat(null)
      setEditError('')
    },
    onError: (err) => {
      if (isAxiosError(err)) setEditError(err.response?.data?.detail || 'Failed to update')
    },
  })

  if (cats.isLoading) return <LoadingState />
  if (cats.isError) return <ErrorState onRetry={() => cats.refetch()} />

  return (
    <>
      {showAdd && (
        <AddCategoryForm
          error={formError}
          loading={createMut.isPending}
          onSubmit={(data) => createMut.mutate(data)}
          onCancel={onCloseAdd}
        />
      )}

      {editCat && (
        <AddCategoryForm
          key={editCat.id}
          title="Edit Category"
          submitLabel="Save"
          initial={{ name: editCat.name, warranty_months: editCat.warranty_months ?? null }}
          error={editError}
          loading={updateMut.isPending}
          onSubmit={(data) => updateMut.mutate({ id: editCat.id, data })}
          onCancel={() => { setEditCat(null); setEditError('') }}
        />
      )}

      {!cats.data?.length ? (
        <EmptyState title="No categories" message="Create your first category to organize assets." />
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Name', 'Warranty Period', ''].map((h) => (
                  <th key={h} style={{
                    textAlign: 'left',
                    padding: '12px 16px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    color: 'var(--color-text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    borderBottom: '1px solid var(--color-border)',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cats.data.map((cat) => (
                <tr
                  key={cat.id}
                  style={{ borderBottom: '1px solid var(--color-border)', transition: 'background 0.1s' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-bg-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '12px 16px', fontSize: '0.85rem', fontWeight: 500 }}>
                    {cat.name}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
                    {cat.warranty_months ? `${cat.warranty_months} months` : '—'}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <button
                      className="btn-secondary"
                      style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                      onClick={() => { setEditCat(cat); setEditError('') }}
                    >
                      <Edit2 size={12} />
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function AddCategoryForm({
  error,
  loading,
  onSubmit,
  onCancel,
  initial,
  title = 'Add Category',
  submitLabel = 'Create',
}: {
  error: string
  loading: boolean
  onSubmit: (data: { name: string; warranty_months?: number | null }) => void
  onCancel: () => void
  initial?: { name: string; warranty_months: number | null }
  title?: string
  submitLabel?: string
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [warranty, setWarranty] = useState(
    initial?.warranty_months != null ? String(initial.warranty_months) : ''
  )

  return (
    <div className="card animate-fade-in" style={{ padding: '20px 24px', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 600 }}>{title}</h3>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
          <X size={18} />
        </button>
      </div>
      {error && (
        <div style={{ padding: '8px 12px', marginBottom: 12, borderRadius: 'var(--radius-sm)', background: 'var(--color-pill-red-bg)', color: 'var(--color-pill-red-text)', fontSize: '0.8rem' }}>
          {error}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'end' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: 4 }}>Name *</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Category name" />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: 4 }}>Warranty (months)</label>
          <input className="input" type="number" value={warranty} onChange={(e) => setWarranty(e.target.value)} placeholder="Optional" min="0" />
        </div>
        <button
          className="btn-primary"
          disabled={!name.trim() || loading}
          onClick={() => onSubmit({
            name: name.trim(),
            warranty_months: warranty ? Number(warranty) : null,
          })}
          style={{ padding: '10px 20px' }}
        >
          {loading ? '…' : submitLabel}
        </button>
      </div>
    </div>
  )
}

/* ================================================================
   EMPLOYEE TAB
   ================================================================ */
function EmployeeTab() {
  const queryClient = useQueryClient()
  const [promoteId, setPromoteId] = useState<number | null>(null)

  const users = useQuery({
    queryKey: ['users'],
    queryFn: () => usersAPI.list().then(r => r.data),
  })

  const roleMut = useMutation({
    mutationFn: ({ id, role }: { id: number; role: string }) =>
      usersAPI.updateRole(id, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setPromoteId(null)
    },
  })

  const statusMut = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      usersAPI.updateStatus(id, is_active),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })

  if (users.isLoading) return <LoadingState />
  if (users.isError) return <ErrorState onRetry={() => users.refetch()} />
  if (!users.data?.length) return <EmptyState title="No employees" message="Employees appear here after they sign up." />

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['Name', 'Email', 'Department', 'Role', 'Status', ''].map((h) => (
              <th key={h} style={{
                textAlign: 'left',
                padding: '12px 16px',
                fontSize: '0.72rem',
                fontWeight: 600,
                color: 'var(--color-text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                borderBottom: '1px solid var(--color-border)',
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {users.data.map((u) => (
            <tr
              key={u.id}
              style={{ borderBottom: '1px solid var(--color-border)', transition: 'background 0.1s' }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-bg-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <td style={{ padding: '12px 16px', fontSize: '0.85rem', fontWeight: 500 }}>
                {u.name}
              </td>
              <td style={{ padding: '12px 16px', fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
                {u.email}
              </td>
              <td style={{ padding: '12px 16px', fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
                {u.department_name || '—'}
              </td>
              <td style={{ padding: '12px 16px' }}>
                {promoteId === u.id ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <select
                      className="select"
                      style={{ width: 'auto', padding: '6px 30px 6px 10px', fontSize: '0.78rem' }}
                      defaultValue={u.role}
                      onChange={(e) => {
                        roleMut.mutate({ id: u.id, role: e.target.value })
                      }}
                    >
                      <option value="employee">Employee</option>
                      <option value="dept_head">Dept Head</option>
                      <option value="asset_manager">Asset Manager</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button
                      onClick={() => setPromoteId(null)}
                      style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <StatusPill label={u.role} />
                )}
              </td>
              <td style={{ padding: '12px 16px' }}>
                <StatusPill
                  label={u.is_active ? 'Active' : 'Inactive'}
                  variant={u.is_active ? 'green' : 'muted'}
                />
              </td>
              <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button
                    className="btn-secondary"
                    style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                    onClick={() => setPromoteId(u.id === promoteId ? null : u.id)}
                  >
                    <Check size={12} />
                    Promote
                  </button>
                  <button
                    className="btn-secondary"
                    style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                    onClick={() => statusMut.mutate({ id: u.id, is_active: !u.is_active })}
                  >
                    {u.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
