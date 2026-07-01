import {
  Activity,
  BookUser,
  Briefcase,
  Building2,
  Layers,
  LayoutTemplate,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react"
import { Navigate, NavLink, Outlet } from "react-router"

import { useAuth } from "@/hooks/useAuth"
import { hasRole } from "@/lib/roles"

type Item = {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  /** Which role gates this entry — matches the route's AdminRoute guard. */
  requireRole?: "admin" | "department_manager"
}

type Group = {
  label: string
  items: Item[]
}

const GROUPS: Group[] = [
  {
    label: "Taxonomy",
    items: [
      { to: "/admin/departments", label: "Departments", icon: Building2, requireRole: "admin" },
      { to: "/admin/clients", label: "Clients", icon: Briefcase, requireRole: "department_manager" },
      { to: "/admin/disciplines", label: "Disciplines", icon: Layers, requireRole: "department_manager" },
      {
        to: "/admin/templates",
        label: "Templates",
        icon: LayoutTemplate,
        requireRole: "department_manager",
      },
    ],
  },
  {
    label: "Accounts",
    items: [
      { to: "/admin/users", label: "Users", icon: Users, requireRole: "admin" },
      {
        to: "/admin/roster",
        label: "Roster",
        icon: ShieldCheck,
        requireRole: "department_manager",
      },
      { to: "/admin/contacts", label: "Contacts", icon: BookUser, requireRole: "admin" },
    ],
  },
]

const STANDALONE: Item[] = [
  // Audit log lives outside the Taxonomy/Accounts groups — it's a
  // standalone monitoring tool, not a record-management surface.
  { to: "/admin/audit-log", label: "Audit log", icon: Activity, requireRole: "admin" },
  { to: "/admin/settings", label: "Settings", icon: Settings, requireRole: "admin" },
]

/**
 * Phase 4.5.1 — admin section layout. Renders a nested left sub-sidebar
 * next to the routed admin page content. Sits inside the global
 * AppLayout, so the main sidebar from 4.1 stays at the far left and
 * this lives in what was previously the page area.
 *
 * Items are gated by the same `requireRole` set as their `<AdminRoute>`
 * guards in `App.tsx` — non-DMs don't see Templates or Roster in the
 * sidebar at all.
 */
export function AdminLayout() {
  const { data: user } = useAuth()
  const roles = user?.roles ?? []

  return (
    <div className="grid grid-cols-1 gap-6 px-6 py-7 md:grid-cols-[220px_1fr]">
      <aside className="space-y-5">
        {GROUPS.map((group) => {
          const visible = group.items.filter(
            (it) => !it.requireRole || hasRole(roles, it.requireRole),
          )
          if (visible.length === 0) return null
          return (
            <nav key={group.label} className="space-y-1">
              <h3 className="px-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                {group.label}
              </h3>
              {visible.map((it) => (
                <AdminNavLink key={it.to} item={it} />
              ))}
            </nav>
          )
        })}
        <nav className="space-y-1">
          {STANDALONE.filter(
            (it) => !it.requireRole || hasRole(roles, it.requireRole),
          ).map((it) => (
            <AdminNavLink key={it.to} item={it} />
          ))}
        </nav>
      </aside>
      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  )
}

/**
 * Index route element for `/admin` — sends the user to the first admin
 * destination they can actually reach. Admins land on Departments;
 * department managers (no admin role) land on Templates, the first
 * surface they can use. Keeps the global "Admin Settings" sidebar link
 * working for both roles without exposing forbidden routes via redirect.
 */
export function AdminIndexRedirect() {
  const { data: user } = useAuth()
  const roles = user?.roles ?? []
  const target = hasRole(roles, "admin")
    ? "/admin/departments"
    : "/admin/templates"
  return <Navigate to={target} replace />
}

function AdminNavLink({ item }: { item: Item }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end
      className={({ isActive }) =>
        "flex h-8 items-center gap-2 rounded-md px-2 text-sm transition-colors " +
        (isActive
          ? "bg-muted font-medium text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")
      }
    >
      <Icon className="size-4 shrink-0" />
      {item.label}
    </NavLink>
  )
}
