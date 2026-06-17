import { ChevronRight } from "lucide-react"
import { useMemo } from "react"
import { Link } from "react-router"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useTopbarCrumbs } from "@/hooks/useTopbarCrumbs"
import { useMyDepartments } from "@/api/me"

export function RosterIndexPage() {
  useTopbarCrumbs(useMemo(() => [{ label: "Admin" }, { label: "Roster" }], []))

  const departments = useMyDepartments()

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-[20px] font-semibold tracking-[-0.01em]">Roster</h1>
        <p className="text-sm text-muted-foreground">
          Manage role grants per department. Pick a department to view its roster.
        </p>
      </header>

      {departments.isError && (
        <Alert variant="destructive">
          <AlertTitle>Couldn't load departments</AlertTitle>
          <AlertDescription>{departments.error.detail}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {departments.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (departments.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No departments available.
          </p>
        ) : (
          (departments.data ?? []).map((d) => (
            <Link
              key={d.id}
              to={`/admin/departments/${d.id}/roster`}
              className="group flex items-center gap-3 rounded-md border bg-background p-4 transition-colors hover:border-foreground/30 hover:bg-muted/40"
            >
              <span className="inline-flex items-center rounded-[5px] border bg-muted/40 px-1.5 py-0.5 font-mono text-[11.75px] text-foreground">
                {d.code}
              </span>
              <span className="flex-1 truncate text-sm">{d.name}</span>
              <ChevronRight
                aria-hidden
                className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
              />
            </Link>
          ))
        )}
      </div>
    </div>
  )
}
