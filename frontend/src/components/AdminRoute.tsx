import type { ReactNode } from "react"
import { Navigate } from "react-router"

import { useAuth } from "@/hooks/useAuth"
import { hasRole } from "@/lib/roles"

type Props = {
  children: ReactNode
  // The minimum role required. Defaults to "admin" (the org-wide gate).
  // Pages reachable by department managers (e.g., the dept roster) can
  // pass "department_manager" to allow DMs in too.
  requireRole?: "admin" | "department_manager" | "project_editor" | "viewer"
}

export function AdminRoute({ children, requireRole = "admin" }: Props) {
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

  if (!hasRole(user.roles, requireRole)) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
