import { type CSSProperties, useMemo, useState } from "react"

import {
  type AuditLogFilters,
  type AuditLogItem,
  useAuditLogList,
} from "@/api/audit_log"
import { Badge, type BadgeTone } from "@/components/Badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useTopbarCrumbs } from "@/hooks/useTopbarCrumbs"

const ENTITY_TYPES = [
  { value: "project", label: "Project" },
  { value: "milestone", label: "Milestone" },
  { value: "cor", label: "COR" },
  { value: "note", label: "Note" },
  { value: "user_role", label: "Role grant" },
  { value: "project_role_assignment", label: "Project access" },
]

const ALL = "__all__"

const PAGE_SIZE = 50

const DENSITY_ROW_STYLE: CSSProperties = {
  height: "var(--row-h)",
  fontSize: "var(--fs-table)",
}
const DENSITY_CELL_STYLE: CSSProperties = {
  paddingTop: "var(--row-py)",
  paddingBottom: "var(--row-py)",
}

const OPERATION_TONES: Record<string, BadgeTone> = {
  create: "emerald",
  update: "blue",
  delete: "rose",
  transition: "indigo",
  grant: "emerald",
  revoke: "rose",
}

function operationTone(op: string): BadgeTone {
  return OPERATION_TONES[op] ?? "slate"
}

export function renderChanges(item: AuditLogItem): string {
  const { operation, changes } = item
  if (operation === "create") return "Created"
  if (operation === "delete") return "Deleted"
  if (operation === "transition") {
    const from = String(changes["from"] ?? "?")
    const to = String(changes["to"] ?? "?")
    return `${from} → ${to}`
  }
  if (operation === "grant" || operation === "revoke") {
    return renderGrantOrRevoke(item)
  }
  if (operation === "update") {
    return renderUpdateDiff(changes)
  }
  return JSON.stringify(changes)
}

function renderGrantOrRevoke(item: AuditLogItem): string {
  const { entity_type, operation, changes } = item
  const verb = operation === "grant" ? "Granted" : "Revoked"
  if (entity_type === "user_role") {
    const role = changes["role_id"] as string | undefined
    const dept = changes["department_id"] as string | null | undefined
    if (dept) return `${verb} ${role ?? "?"} in dept ${truncate(dept, 8)}`
    return `${verb} ${role ?? "?"} (org-wide)`
  }
  if (entity_type === "project_role_assignment") {
    const uid = changes["granted_user_id"] as string | undefined
    return `${verb} project access for ${uid ? truncate(uid, 8) : "?"}`
  }
  return `${verb} (${entity_type})`
}

function renderUpdateDiff(changes: Record<string, unknown>): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(changes)) {
    if (Array.isArray(value) && value.length === 2) {
      const [oldV, newV] = value
      parts.push(`${key}: ${formatValue(oldV)} → ${formatValue(newV)}`)
    } else if (key === "custom_field_values" && typeof value === "object") {
      const subParts: string[] = []
      for (const [fk, fv] of Object.entries(
        value as Record<string, unknown>,
      )) {
        if (Array.isArray(fv) && fv.length === 2) {
          subParts.push(
            `${truncate(fk, 8)}: ${formatValue(fv[0])} → ${formatValue(fv[1])}`,
          )
        }
      }
      if (subParts.length > 0) {
        parts.push(`custom_field_values { ${subParts.join("; ")} }`)
      }
    }
  }
  return parts.length > 0 ? parts.join("; ") : "(no change)"
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "∅"
  const s = typeof v === "string" ? `"${v}"` : String(v)
  return truncate(s, 40)
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

function entityTypeLabel(type: string): string {
  return (
    ENTITY_TYPES.find((t) => t.value === type)?.label ?? type
  )
}

export function AuditLogPage() {
  useTopbarCrumbs(
    useMemo(() => [{ label: "Admin" }, { label: "Audit log" }], []),
  )

  // Draft filters live in component state; the "Apply" button copies them
  // to `applied` which is what we query against. Prevents debounce-free
  // refetches on every keystroke in the user/project ID fields.
  const [draft, setDraft] = useState<AuditLogFilters>({})
  const [applied, setApplied] = useState<AuditLogFilters>({})
  const [page, setPage] = useState(1)

  const query = useAuditLogList({
    ...applied,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  })

  const total = query.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const onApply = () => {
    setApplied(draft)
    setPage(1)
  }

  const onReset = () => {
    setDraft({})
    setApplied({})
    setPage(1)
  }

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-[20px] font-semibold tracking-[-0.01em]">
          Audit log
        </h1>
        <p className="text-sm text-muted-foreground">
          Who changed what, and when. Defaults to the last 30 days.
        </p>
      </header>

      {/* Filter row */}
      <div className="grid grid-cols-1 gap-2 rounded-md border bg-background p-3 sm:grid-cols-6">
        <div className="sm:col-span-2">
          <label className="text-xs font-medium text-muted-foreground">
            Entity type
          </label>
          <Select
            value={draft.entity_type ?? ALL}
            onValueChange={(v) =>
              setDraft({
                ...draft,
                entity_type: v === ALL ? undefined : v,
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All</SelectItem>
              {ENTITY_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs font-medium text-muted-foreground">
            User ID
          </label>
          <Input
            value={draft.user_id ?? ""}
            onChange={(e) =>
              setDraft({ ...draft, user_id: e.target.value || undefined })
            }
            placeholder="(any user)"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs font-medium text-muted-foreground">
            Project ID
          </label>
          <Input
            value={draft.project_id ?? ""}
            onChange={(e) =>
              setDraft({
                ...draft,
                project_id: e.target.value || undefined,
              })
            }
            placeholder="(any project)"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            From
          </label>
          <Input
            type="date"
            value={draft.from ?? ""}
            onChange={(e) =>
              setDraft({ ...draft, from: e.target.value || undefined })
            }
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            To
          </label>
          <Input
            type="date"
            value={draft.to ?? ""}
            onChange={(e) =>
              setDraft({ ...draft, to: e.target.value || undefined })
            }
          />
        </div>
        <div className="flex items-end gap-2 sm:col-span-4">
          <Button onClick={onApply}>Apply</Button>
          <Button variant="ghost" onClick={onReset}>
            Reset
          </Button>
        </div>
      </div>

      {query.isError && (
        <Alert variant="destructive">
          <AlertTitle>Couldn't load audit log</AlertTitle>
          <AlertDescription>{query.error.detail}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[160px]">When</TableHead>
              <TableHead className="w-[180px]">Who</TableHead>
              <TableHead className="w-[120px]">Entity</TableHead>
              <TableHead className="w-[100px]">Op</TableHead>
              <TableHead>Changes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-sm text-muted-foreground"
                >
                  Loading…
                </TableCell>
              </TableRow>
            ) : (query.data?.items ?? []).length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-sm text-muted-foreground"
                >
                  No matching audit entries.
                </TableCell>
              </TableRow>
            ) : (
              query.data!.items.map((item) => (
                <TableRow key={item.id} style={DENSITY_ROW_STYLE}>
                  <TableCell
                    className="font-mono text-xs"
                    style={DENSITY_CELL_STYLE}
                  >
                    <time
                      title={new Date(item.changed_at).toISOString()}
                      dateTime={item.changed_at}
                    >
                      {new Date(item.changed_at).toLocaleString()}
                    </time>
                  </TableCell>
                  <TableCell style={DENSITY_CELL_STYLE}>
                    {item.changed_by_email}
                  </TableCell>
                  <TableCell style={DENSITY_CELL_STYLE}>
                    {entityTypeLabel(item.entity_type)}
                  </TableCell>
                  <TableCell style={DENSITY_CELL_STYLE}>
                    <Badge tone={operationTone(item.operation)} dot>
                      {item.operation}
                    </Badge>
                  </TableCell>
                  <TableCell style={DENSITY_CELL_STYLE}>
                    {renderChanges(item)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {total > 0
            ? `Page ${page} of ${pageCount} · ${total} total`
            : ""}
        </p>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={page >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}
