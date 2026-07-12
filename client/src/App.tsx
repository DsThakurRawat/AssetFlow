import { Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute, PublicOnlyRoute } from './lib/auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import OrgSetup from './pages/OrgSetup'
import Assets from './pages/Assets'
import Allocation from './pages/Allocation'
import Booking from './pages/Booking'
import Maintenance from './pages/Maintenance'
import Audit from './pages/Audit'
import Reports from './pages/Reports'
import Notifications from './pages/Notifications'

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <Login />
          </PublicOnlyRoute>
        }
      />

      {/* Protected routes with sidebar layout */}
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/org-setup" element={<OrgSetup />} />
        <Route path="/assets" element={<Assets />} />
        <Route path="/allocation" element={<Allocation />} />
        <Route path="/booking" element={<Booking />} />
        <Route path="/maintenance" element={<Maintenance />} />
        <Route path="/audit" element={<Audit />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/notifications" element={<Notifications />} />
      </Route>

      {/* Default redirect */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
