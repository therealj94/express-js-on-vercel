import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/auth'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, status } = useAuthStore()
  const location = useLocation()

  if (status !== 'ready') return null
  if (!user) {
    return <Navigate to="/iniciar-sesion" replace state={{ from: location.pathname }} />
  }
  return <>{children}</>
}
