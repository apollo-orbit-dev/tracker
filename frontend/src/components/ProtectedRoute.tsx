import type { ReactNode } from "react"
import { Navigate } from "react-router"

import { useAuth } from "@/hooks/useAuth"

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { data: user, isLoading, isError } = useAuth()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    )
  }

  if (isError || !user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
