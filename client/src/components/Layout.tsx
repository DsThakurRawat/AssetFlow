import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import {
  LayoutDashboard,
  Building2,
  Package,
  ArrowLeftRight,
  CalendarClock,
  Wrench,
  ClipboardCheck,
  BarChart3,
  Bell,
  LogOut,
  ChevronRight,
} from 'lucide-react'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/org-setup', label: 'Organization Setup', icon: Building2, adminOnly: true },
  { to: '/assets', label: 'Assets', icon: Package },
  { to: '/allocation', label: 'Allocation & Transfer', icon: ArrowLeftRight },
  { to: '/booking', label: 'Resource Booking', icon: CalendarClock },
  { to: '/maintenance', label: 'Maintenance', icon: Wrench },
  { to: '/audit', label: 'Audit', icon: ClipboardCheck },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/notifications', label: 'Notifications', icon: Bell },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const visibleNavItems = navItems.filter(
    (item) => !item.adminOnly || user?.role === 'admin'
  )

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: 'var(--color-bg-app)',
    }}>
      {/* ---- Sidebar ---- */}
      <aside style={{
        width: 220,
        minWidth: 220,
        background: 'var(--color-bg-sidebar)',
        borderRight: '1px solid var(--color-border)',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        zIndex: 50,
      }}>
        {/* Brand */}
        <div
          onClick={() => navigate('/dashboard')}
          style={{
            padding: '24px 20px 20px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: 'linear-gradient(135deg, var(--color-accent-green), #16a34a)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: '0.8rem',
            color: '#fff',
            letterSpacing: '-0.02em',
          }}>
            AF
          </div>
          <span style={{
            fontSize: '1.1rem',
            fontWeight: 700,
            color: 'var(--color-text-primary)',
            letterSpacing: '-0.02em',
          }}>
            AssetFlow
          </span>
        </div>

        {/* Nav items */}
        <nav style={{
          flex: 1,
          padding: '4px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          overflowY: 'auto',
        }}>
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                textDecoration: 'none',
                fontSize: '0.85rem',
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                background: isActive ? 'var(--color-bg-hover)' : 'transparent',
                transition: 'all 0.15s ease',
              })}
              onMouseEnter={(e) => {
                const el = e.currentTarget
                if (!el.classList.contains('active')) {
                  el.style.background = 'var(--color-bg-hover)'
                }
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget
                if (!el.getAttribute('class')?.includes('active')) {
                  // NavLink handles active state
                }
              }}
            >
              <item.icon size={18} strokeWidth={1.8} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.to === '/notifications' && (
                <ChevronRight size={14} style={{ opacity: 0.4 }} />
              )}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div style={{
          padding: '16px',
          borderTop: '1px solid var(--color-border)',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 12,
          }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: 'var(--radius-full)',
              background: 'linear-gradient(135deg, var(--color-accent-purple), var(--color-accent-blue))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              fontWeight: 700,
              color: '#fff',
            }}>
              {user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: '0.8rem',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {user?.name || 'User'}
              </div>
              <div style={{
                fontSize: '0.7rem',
                color: 'var(--color-text-muted)',
                textTransform: 'capitalize',
              }}>
                {user?.role?.replace('_', ' ') || 'employee'}
              </div>
            </div>
          </div>
          <button
            onClick={logout}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: 'transparent',
              color: 'var(--color-text-muted)',
              fontSize: '0.8rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-bg-hover)'
              e.currentTarget.style.color = 'var(--color-accent-red)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--color-text-muted)'
            }}
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>

      {/* ---- Main content ---- */}
      <main style={{
        flex: 1,
        marginLeft: 220,
        padding: '28px 32px',
        minHeight: '100vh',
        maxWidth: 'calc(100vw - 220px)',
      }}>
        <Outlet />
      </main>
    </div>
  )
}
