import { MoreHorizontal, Search } from "lucide-react"
import { type CSSProperties, useMemo, useState } from "react"
import { useParams } from "react-router"
import { toast } from "sonner"

import { Avatar } from "@/components/Avatar"
import { Badge } from "@/components/Badge"
import { RosterAddSheet } from "@/components/RosterAddSheet"
import { RosterEditSheet } from "@/components/RosterEditSheet"
import { RosterRevokeDialog } from "@/components/RosterRevokeDialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useTopbarCrumbs } from "@/hooks/useTopbarCrumbs"
import { useMyDepartments } from "@/api/me"
import { type RosterEntry, useDepartmentRoster } from "@/api/roster"
import { roleLabel, roleTone } from "@/lib/roles"

const DENSITY_ROW_STYLE: CSSProperties = {
  height: "var(--row-h)",
  fontSize: "var(--fs-table)",
}
const DENSITY_CELL_STYLE: CSSProperties = {
  paddingTop: "var(--row-py)",
  paddingBottom: "var(--row-py)",
}

export function RosterPage() {
  const params = useParams<{ deptId: string }>()
  const deptId = params.deptId ?? ""
  const roster = useDepartmentRoster(deptId)
  const departments = useMyDepartments()
  const dept = (departments.data ?? []).find((d) => d.id === deptId)
  const deptLabel = dept ? `${dept.code}` : "Department"

  useTopbarCrumbs(
    useMemo(
      () => [
        { label: "Admin" },
        { label: "Roster", to: "/admin/roster" },
        { label: dept?.code ?? "…" },
      ],
      [dept?.code],
    ),
  )

  const [search, setSearch] = useState("")
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<RosterEntry | null>(null)
  const [revoking, setRevoking] = useState<RosterEntry | null>(null)

  const allItems = roster.data?.items ?? []

  const items = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return allItems
    return allItems.filter(
      (e) =>
        e.display_name.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        roleLabel(e.role_id).toLowerCase().includes(q),
    )
  }, [search, allItems])

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-[20px] font-semibold tracking-[-0.01em]">
            {dept ? dept.name : "Roster"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {dept
              ? `Users with role grants in ${dept.code} — ${dept.name}.`
              : "Users with role grants in this department."}
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>Add to roster</Button>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, or role…"
            className="pl-8"
            aria-label="Search roster"
          />
        </div>
        <span className="ml-auto rounded-md border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{items.length}</span>
          {search.trim() && items.length !== allItems.length ? (
            <> of {allItems.length}</>
          ) : null}{" "}
          {allItems.length === 1 ? "grant" : "grants"}
        </span>
      </div>

      {roster.isError && (
        <Alert variant="destructive">
          <AlertTitle>Couldn't load roster</AlertTitle>
          <AlertDescription>{roster.error.detail}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead className="w-[230px]">Email</TableHead>
              <TableHead className="w-[200px]">Role</TableHead>
              <TableHead className="w-[140px]">Granted</TableHead>
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roster.isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-sm text-muted-foreground"
                >
                  Loading…
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-sm text-muted-foreground"
                >
                  {search.trim()
                    ? `No grants match "${search.trim()}".`
                    : "No one is on this roster yet."}
                </TableCell>
              </TableRow>
            ) : (
              items.map((e) => (
                <TableRow key={e.user_role_id} style={DENSITY_ROW_STYLE}>
                  <TableCell style={DENSITY_CELL_STYLE}>
                    <span className="flex items-center gap-2">
                      <Avatar name={e.display_name || e.email} size={20} />
                      <span className="font-medium">{e.display_name}</span>
                    </span>
                  </TableCell>
                  <TableCell
                    className="font-mono text-xs text-muted-foreground"
                    style={DENSITY_CELL_STYLE}
                  >
                    {e.email}
                  </TableCell>
                  <TableCell style={DENSITY_CELL_STYLE}>
                    <Badge tone={roleTone(e.role_id)} dot>
                      {roleLabel(e.role_id)}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className="text-xs text-muted-foreground tabular-nums"
                    style={DENSITY_CELL_STYLE}
                  >
                    <time
                      title={new Date(e.created_at).toISOString()}
                      dateTime={e.created_at}
                    >
                      {new Date(e.created_at).toLocaleDateString()}
                    </time>
                  </TableCell>
                  <TableCell style={DENSITY_CELL_STYLE}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Actions for ${e.display_name}`}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditing(e)}>
                          Edit role
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => setRevoking(e)}
                        >
                          Revoke
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <RosterAddSheet
        deptId={deptId}
        deptLabel={deptLabel}
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={() => toast.success("Role granted")}
      />
      <RosterEditSheet
        deptId={deptId}
        entry={editing}
        onOpenChange={(open) => !open && setEditing(null)}
        onSuccess={() => toast.success("Role updated")}
      />
      <RosterRevokeDialog
        deptId={deptId}
        entry={revoking}
        onOpenChange={(open) => !open && setRevoking(null)}
        onRevoked={() => toast.success("Role revoked")}
      />
    </div>
  )
}
