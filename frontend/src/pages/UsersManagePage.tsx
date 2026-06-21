import { MoreHorizontal, Search } from "lucide-react"
import { type CSSProperties, useMemo, useState } from "react"
import { toast } from "sonner"

import { Avatar } from "@/components/Avatar"
import { Badge, type BadgeTone } from "@/components/Badge"
import { UserDeleteDialog } from "@/components/UserDeleteDialog"
import { UserResetPasswordSheet } from "@/components/UserResetPasswordSheet"
import { UserSheet } from "@/components/UserSheet"
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
import { useAuth } from "@/hooks/useAuth"
import { useTopbarCrumbs } from "@/hooks/useTopbarCrumbs"
import {
  type UserItem,
  useUserAdminGrant,
  useUserAdminRevoke,
  useUserList,
  useUserOrgViewerGrant,
  useUserOrgViewerRevoke,
} from "@/api/users"
import { isOrgRole, roleLabel, roleTone } from "@/lib/roles"

const STATUS_TONE: Record<string, BadgeTone> = {
  active: "emerald",
  pending: "amber",
  deactivated: "slate",
}

const DENSITY_ROW_STYLE: CSSProperties = {
  height: "var(--row-h)",
  fontSize: "var(--fs-table)",
}
const DENSITY_CELL_STYLE: CSSProperties = {
  paddingTop: "var(--row-py)",
  paddingBottom: "var(--row-py)",
}

function GrantBadges({ user }: { user: UserItem }) {
  // Only the dept-scoped grants belong here — the org-scoped admin and
  // viewer grants get dedicated columns. Filtering them out keeps the
  // grant chip list focused on department roles.
  const deptGrants = user.grants.filter((g) => g.department_id !== null)
  if (deptGrants.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>
  }
  return (
    <ul className="flex flex-wrap gap-1">
      {deptGrants.map((g, i) => (
        <li
          key={`${g.role_id}:${g.department_id ?? "_"}:${i}`}
          className="inline-flex"
        >
          <Badge tone={roleTone(g.role_id)}>
            {g.department_code ? `${g.department_code} · ` : ""}
            {roleLabel(g.role_id).replace("Department ", "Dept ")}
          </Badge>
        </li>
      ))}
    </ul>
  )
}

export function UsersManagePage() {
  useTopbarCrumbs(useMemo(() => [{ label: "Admin" }, { label: "Users" }], []))

  const list = useUserList()
  const { data: me } = useAuth()
  const grantAdmin = useUserAdminGrant()
  const revokeAdmin = useUserAdminRevoke()
  const grantOrgViewer = useUserOrgViewerGrant()
  const revokeOrgViewer = useUserOrgViewerRevoke()

  const [search, setSearch] = useState("")
  const [editing, setEditing] = useState<UserItem | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [resetting, setResetting] = useState<UserItem | null>(null)
  const [deleting, setDeleting] = useState<UserItem | null>(null)

  const allUsers = list.data?.users ?? []

  const users = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return allUsers
    return allUsers.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        u.display_name.toLowerCase().includes(q),
    )
  }, [search, allUsers])

  const onAdminToggle = (u: UserItem) => {
    if (isOrgRole(u.grants, "admin")) {
      revokeAdmin.mutate(u.id, {
        onSuccess: () => toast.success("Org admin revoked"),
        onError: (e) => toast.error(e.detail),
      })
    } else {
      grantAdmin.mutate(u.id, {
        onSuccess: () => toast.success("Org admin granted"),
        onError: (e) => toast.error(e.detail),
      })
    }
  }

  const onOrgViewerToggle = (u: UserItem) => {
    const hasOrgViewer = u.grants.some(
      (g) => g.role_id === "viewer" && g.department_id === null,
    )
    if (hasOrgViewer) {
      revokeOrgViewer.mutate(u.id, {
        onSuccess: () => toast.success("Org viewer revoked"),
        onError: (e) => toast.error(e.detail),
      })
    } else {
      grantOrgViewer.mutate(u.id, {
        onSuccess: () => toast.success("Org viewer granted"),
        onError: (e) => toast.error(e.detail),
      })
    }
  }

  const total = list.data?.total ?? 0

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-[20px] font-semibold tracking-[-0.01em]">
            Users
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage user accounts and the org-scope grants (admin, viewer).
            Dept-scoped roles are managed through Roster.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null)
            setSheetOpen(true)
          }}
        >
          New user
        </Button>
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
            placeholder="Search name or email…"
            className="pl-8"
            aria-label="Search users"
          />
        </div>
        <span className="ml-auto rounded-md border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {search.trim() ? users.length : total}
          </span>{" "}
          {(search.trim() ? users.length : total) === 1 ? "user" : "users"}
          {search.trim() && total !== users.length ? (
            <span className="text-muted-foreground"> of {total}</span>
          ) : null}
        </span>
      </div>

      {list.isError && (
        <Alert variant="destructive">
          <AlertTitle>Couldn't load users</AlertTitle>
          <AlertDescription>{list.error.detail}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead className="w-[220px]">Email</TableHead>
              <TableHead>Department roles</TableHead>
              <TableHead className="w-[120px]">Org admin</TableHead>
              <TableHead className="w-[120px]">Org viewer</TableHead>
              <TableHead className="w-[110px]">Status</TableHead>
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-sm text-muted-foreground"
                >
                  Loading…
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-sm text-muted-foreground"
                >
                  {search.trim()
                    ? `No users match "${search.trim()}".`
                    : "No users."}
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => {
                const isSelf = u.id === me?.id
                const isAdmin = u.grants.some(
                  (g) =>
                    g.role_id === "admin" && g.department_id === null,
                )
                const isOrgViewer = u.grants.some(
                  (g) =>
                    g.role_id === "viewer" && g.department_id === null,
                )
                const tone = STATUS_TONE[u.lifecycle_state] ?? "slate"
                return (
                  <TableRow
                    key={u.id}
                    style={{
                      ...DENSITY_ROW_STYLE,
                      opacity:
                        u.lifecycle_state === "deactivated" ? 0.62 : 1,
                    }}
                  >
                    <TableCell style={DENSITY_CELL_STYLE}>
                      <span className="flex items-center gap-2">
                        <Avatar name={u.display_name || u.email} size={22} />
                        <span className="font-medium">{u.display_name}</span>
                      </span>
                    </TableCell>
                    <TableCell
                      className="font-mono text-xs"
                      style={DENSITY_CELL_STYLE}
                    >
                      {u.email}
                    </TableCell>
                    <TableCell style={DENSITY_CELL_STYLE}>
                      <GrantBadges user={u} />
                    </TableCell>
                    <TableCell style={DENSITY_CELL_STYLE}>
                      {isAdmin ? (
                        <Badge tone="indigo" dot>
                          Org admin
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          —
                        </span>
                      )}
                    </TableCell>
                    <TableCell style={DENSITY_CELL_STYLE}>
                      {isOrgViewer ? (
                        <Badge tone="slate" dot>
                          Org viewer
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          —
                        </span>
                      )}
                    </TableCell>
                    <TableCell style={DENSITY_CELL_STYLE}>
                      <Badge tone={tone} dot>
                        {u.lifecycle_state}
                      </Badge>
                    </TableCell>
                    <TableCell style={DENSITY_CELL_STYLE}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Actions for ${u.email}`}
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => {
                              setEditing(u)
                              setSheetOpen(true)
                            }}
                          >
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => setResetting(u)}
                          >
                            Reset password
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={isSelf && isAdmin}
                            onSelect={() => onAdminToggle(u)}
                          >
                            {isAdmin ? "Revoke org admin" : "Grant org admin"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => onOrgViewerToggle(u)}
                          >
                            {isOrgViewer
                              ? "Revoke org viewer"
                              : "Grant org viewer"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            disabled={isSelf}
                            onSelect={() => setDeleting(u)}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <UserSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        item={editing}
        onSuccess={(m) => toast.success(m)}
      />
      <UserResetPasswordSheet
        item={resetting}
        onOpenChange={(open) => !open && setResetting(null)}
        onSuccess={() => toast.success("Password reset")}
      />
      <UserDeleteDialog
        item={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        onDeleted={() => toast.success("User deleted")}
      />
    </div>
  )
}
