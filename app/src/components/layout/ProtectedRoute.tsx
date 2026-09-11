import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { Compass } from 'lucide-react'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-ink)]">
        <Compass className="h-6 w-6 animate-spin text-[var(--color-gold)]" strokeWidth={1.5} />
      </div>
    )
  }

  if (!session) return <Navigate to="/auth" replace />

  return <>{children}</>
}
