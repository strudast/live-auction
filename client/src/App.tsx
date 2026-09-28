import { Navigate, Route, Routes } from 'react-router-dom'
import { GuestRoute, ProtectedRoute } from './components/RouteGuards'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import RegisterPage from './pages/RegisterPage'

export default function App() {
  return (
    <Routes>
      {/* Layout routes: these have no path of their own. They wrap their
          children with a guard, which is how one check protects many pages. */}
      <Route element={<GuestRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<DashboardPage />} />
        {/* Auction pages will be added here. */}
      </Route>

      {/* Any unknown URL goes home, and the guards decide where to go from there. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}