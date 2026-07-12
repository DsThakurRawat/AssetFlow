import { useState } from 'react'
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
  PanelLeftClose,
  PanelLeftOpen,
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

const EXPANDED = 220
const COLLAPSED = 74

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState<boolean>(
    () => typeof localStorage !== 'undefined' && localStorage.getItem('af_sidebar_collapsed') === '1'
  )

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c
      try { localStorage.setItem('af_sidebar_collapsed', next ? '1' : '0') } catch { /* ignore */ }
      return next
    })
  }

  const width = collapsed ? COLLAPSED : EXPANDED
  const visibleNavItems = navItems.filter((item) => !item.adminOnly || user?.role === 'admin')

  const toggleBtnStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 30,
    height: 30,
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--color-border)',
    background: 'transparent',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  }
  const onToggleHover = (e: React.MouseEvent<HTMLButtonElement>, on: boolean) => {
    e.currentTarget.style.background = on ? 'var(--color-bg-hover)' : 'transparent'
    e.currentTarget.style.color = on ? 'var(--color-accent-green)' : 'var(--color-text-muted)'
    e.currentTarget.style.borderColor = on ? 'var(--color-border-light)' : 'var(--color-border)'
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg-app)' }}>
      {/* ---- Sidebar ---- */}
      <aside
        style={{
          width,
          minWidth: width,
          background: 'var(--color-bg-sidebar)',
          borderRight: '1px solid var(--color-border)',
          display: 'flex',
          flexDirection: 'column',
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          zIndex: 50,
          transition: 'width 0.18s ease, min-width 0.18s ease',
        }}
      >
        {/* Brand + toggle */}
        <div
          style={{
            padding: collapsed ? '22px 0 14px' : '22px 16px 14px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: collapsed ? 'center' : 'stretch',
            gap: 12,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              justifyContent: collapsed ? 'center' : 'flex-start',
            }}
          >
            <div
              onClick={() => navigate('/dashboard')}
              title="AssetFlow"
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: '#101820',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '0.78rem',
                fontFamily: 'var(--font-mono)',
                color: '#00add8',
                letterSpacing: '0.01em',
                boxShadow: '0 2px 8px rgba(16, 24, 32, 0.22)',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              AF
            </div>
            {!collapsed && (
              <span
                onClick={() => navigate('/dashboard')}
                style={{
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  color: 'var(--color-text-primary)',
                  letterSpacing: '-0.02em',
                  cursor: 'pointer',
                }}
              >
                AssetFlow
              </span>
            )}
            {!collapsed && (
              <button
                onClick={toggle}
                title="Collapse sidebar"
                aria-label="Collapse sidebar"
                style={{ ...toggleBtnStyle, marginLeft: 'auto' }}
                onMouseEnter={(e) => onToggleHover(e, true)}
                onMouseLeave={(e) => onToggleHover(e, false)}
              >
                <PanelLeftClose size={16} />
              </button>
            )}
          </div>
          {collapsed && (
            <button
              onClick={toggle}
              title="Expand sidebar"
              aria-label="Expand sidebar"
              style={toggleBtnStyle}
              onMouseEnter={(e) => onToggleHover(e, true)}
              onMouseLeave={(e) => onToggleHover(e, false)}
            >
              <PanelLeftOpen size={16} />
            </button>
          )}
        </div>

        {/* Nav items */}
        <nav
          style={{
            flex: 1,
            padding: collapsed ? '4px 10px' : '4px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
            overflowY: 'auto',
            overflowX: 'hidden',
          }}
        >
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              title={collapsed ? item.label : undefined}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'flex-start',
                gap: collapsed ? 0 : 10,
                padding: collapsed ? '11px 0' : '10px 12px',
                borderRadius: 'var(--radius-sm)',
                textDecoration: 'none',
                fontSize: '0.85rem',
                fontWeight: isActive ? 650 : 450,
                color: isActive ? 'var(--color-accent-green)' : 'var(--color-text-secondary)',
                background: isActive ? 'rgba(0, 125, 156, 0.10)' : 'transparent',
                boxShadow: isActive && !collapsed ? 'inset 3px 0 0 var(--color-accent-green)' : 'none',
                transition: 'background 0.15s ease, color 0.15s ease',
                whiteSpace: 'nowrap',
              })}
              onMouseEnter={(e) => {
                if (!e.currentTarget.classList.contains('active')) {
                  e.currentTarget.style.background = 'var(--color-bg-hover)'
                }
              }}
              onMouseLeave={(e) => {
                // NavLink re-applies its own style function on active state
                e.currentTarget.style.background = e.currentTarget.getAttribute('aria-current')
                  ? 'rgba(0, 125, 156, 0.10)'
                  : 'transparent'
              }}
            >
              <item.icon size={18} strokeWidth={1.8} style={{ flexShrink: 0 }} />
              {!collapsed && <span style={{ flex: 1 }}>{item.label}</span>}
              {!collapsed && item.to === '/notifications' && (
                <ChevronRight size={14} style={{ opacity: 0.4 }} />
              )}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div
          style={{
            padding: collapsed ? '14px 0' : '16px',
            borderTop: '1px solid var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: collapsed ? 'center' : 'stretch',
            gap: collapsed ? 10 : 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: collapsed ? 0 : 12,
              justifyContent: collapsed ? 'center' : 'flex-start',
            }}
          >
            <div
              title={collapsed ? `${user?.name || 'User'} · ${user?.role?.replace('_', ' ') || 'employee'}` : undefined}
              style={{
                width: 32,
                height: 32,
                borderRadius: 'var(--radius-full)',
                background: '#101820',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.72rem',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                color: '#00add8',
                flexShrink: 0,
              }}
            >
              {user?.name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || '??'}
            </div>
            {!collapsed && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: 'var(--color-text-primary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {user?.name || 'User'}
                </div>
                <div
                  style={{
                    fontSize: '0.7rem',
                    color: 'var(--color-text-muted)',
                    textTransform: 'capitalize',
                  }}
                >
                  {user?.role?.replace('_', ' ') || 'employee'}
                </div>
              </div>
            )}
          </div>
          <button
            onClick={logout}
            title="Sign out"
            aria-label="Sign out"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'flex-start',
              gap: 8,
              width: collapsed ? 30 : '100%',
              height: collapsed ? 30 : undefined,
              padding: collapsed ? 0 : '8px 12px',
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
            {!collapsed && 'Sign out'}
          </button>
        </div>
      </aside>

      {/* ---- Main content ---- */}
      <main
        style={{
          flex: 1,
          marginLeft: width,
          padding: '28px 32px',
          minHeight: '100vh',
          maxWidth: `calc(100vw - ${width}px)`,
          transition: 'margin-left 0.18s ease, max-width 0.18s ease',
        }}
      >
        <Outlet />
      </main>
    </div>
  )
}
