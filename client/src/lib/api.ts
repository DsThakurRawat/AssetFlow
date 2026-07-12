import axios from 'axios'

// Same-origin: Vite proxies /api -> http://localhost:8000 (see vite.config.ts), so the
// JWT httpOnly cookie is sent automatically. withCredentials keeps it robust either way.
export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

// ----- Domain types (shared across screens) -----
export interface User {
  id: number
  name: string
  email: string
  role: 'admin' | 'asset_manager' | 'dept_head' | 'employee'
  department_id: number | null
  department_name?: string | null
  is_active: boolean
}
export interface Department {
  id: number
  name: string
  parent_id: number | null
  head_user_id: number | null
  is_active: boolean
  head_name?: string | null
  parent_name?: string | null
}
export interface Category {
  id: number
  name: string
  warranty_months?: number | null
}
export interface NotificationItem {
  id: number
  type: 'alert' | 'approval' | 'booking'
  message: string
  is_read: boolean
  created_at: string
}
export interface DashboardKPIs {
  available: number
  allocated: number
  maintenance_today: number
  active_bookings: number
  pending_transfers: number
  upcoming_returns: number
  overdue_count: number
}

// ----- Auth -----
export const authAPI = {
  login: (email: string, password: string) => api.post('/auth/login', { email, password }),
  signup: (name: string, email: string, password: string) =>
    api.post('/auth/signup', { name, email, password }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
}

// ----- Dashboard -----
export const dashboardAPI = {
  kpis: () => api.get<DashboardKPIs>('/dashboard/kpis'),
}

// ----- Notifications -----
export const notificationsAPI = {
  list: (params?: { type?: string; limit?: number; page?: number }) =>
    api.get<NotificationItem[]>('/notifications', { params }),
  markRead: (id: number) => api.patch(`/notifications/${id}/read`),
}

// ----- Organization: departments / categories / users -----
export const departmentsAPI = {
  list: () => api.get<Department[]>('/departments'),
  create: (data: Record<string, unknown>) => api.post('/departments', data),
  update: (id: number, data: Record<string, unknown>) => api.patch(`/departments/${id}`, data),
}
export const categoriesAPI = {
  list: () => api.get<Category[]>('/categories'),
  create: (data: Record<string, unknown>) => api.post('/categories', data),
  update: (id: number, data: Record<string, unknown>) => api.patch(`/categories/${id}`, data),
}
export const usersAPI = {
  list: (params?: { department_id?: number; role?: string; is_active?: boolean }) =>
    api.get<User[]>('/users', { params }),
  updateRole: (id: number, role: string) => api.patch(`/users/${id}/role`, { role }),
  updateStatus: (id: number, is_active: boolean) => api.patch(`/users/${id}/status`, { is_active }),
}

// ----- Assets -----
export const assetsAPI = {
  list: (params?: {
    search?: string; category?: number; status?: string; department?: number; bookable?: boolean
  }) => api.get('/assets', { params }),
  get: (id: number) => api.get(`/assets/${id}`),
  create: (data: Record<string, unknown>) => api.post('/assets', data),
}

// ----- Allocations + Transfers -----
export const allocationsAPI = {
  create: (data: Record<string, unknown>) => api.post('/allocations', data),
  return: (id: number, data: Record<string, unknown>) => api.patch(`/allocations/${id}/return`, data),
}
export const transfersAPI = {
  create: (data: Record<string, unknown>) => api.post('/transfers', data),
  decide: (id: number, data: Record<string, unknown>) => api.patch(`/transfers/${id}`, data),
}

// ----- Bookings -----
export const bookingsAPI = {
  list: (params?: { asset_id?: number; date?: string }) => api.get('/bookings', { params }),
  create: (data: Record<string, unknown>) => api.post('/bookings', data),
  cancel: (id: number) => api.patch(`/bookings/${id}/cancel`),
}

// ----- Maintenance -----
export const maintenanceAPI = {
  list: (params?: { status?: string }) => api.get('/maintenance', { params }),
  create: (data: Record<string, unknown>) => api.post('/maintenance', data),
  update: (id: number, data: Record<string, unknown>) => api.patch(`/maintenance/${id}`, data),
}

// ----- Reports (Tier 2) -----
export const reportsAPI = {
  utilization: () => api.get('/reports/utilization'),
  maintenanceFrequency: () => api.get('/reports/maintenance-frequency'),
  mostUsed: () => api.get('/reports/most-used'),
  idle: () => api.get('/reports/idle'),
  exportCSV: () => api.get('/reports/export.csv', { responseType: 'blob' }),
}

// ----- Audit (Tier 2) -----
export const auditAPI = {
  list: () => api.get('/audits'),
  get: (id: number) => api.get(`/audits/${id}`),
  create: (data: Record<string, unknown>) => api.post('/audits', data),
  updateItem: (itemId: number, data: Record<string, unknown>) =>
    api.patch(`/audit-items/${itemId}`, data),
  close: (id: number) => api.patch(`/audits/${id}/close`),
}
