import { useMemo, useState } from "react"
import { Link, useNavigate } from "react-router"
import { Search } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/Badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAuth } from "@/hooks/useAuth"
import { useTopbarCrumbs } from "@/hooks/useTopbarCrumbs"
import { hasRole } from "@/lib/roles"
import { relativeTime } from "@/lib/relativeTime"
import { useMyDepartments } from "@/api/me"
import { useFormCreate, useFormList, type FormListItem } from "@/api/forms"

type FormStatus = "draft" | "active" | "archived"

function statusTone(status: string) {
  switch (status as FormStatus) {
    case "active":
      return "emerald" as const
    case "draft":
      return "amber" as const
    case "archived":
    default:
      return "slate" as const
  }
}

function statusLabel(status: string) {
  switch (status as FormStatus) {
    case "active":
      return "Active"
    case "draft":
      return "Draft"
    case "archived":
      return "Archived"
    default:
      return status
  }
}

function targetLabel(target: string | null) {
  if (target === "cor") return "Change order"
  if (target === "assignment") return "Assignment"
  if (target === "milestone") return "Milestone"
  if (target === "event") return "Event"
  if (target === "intake") return "Project intake"
  if (!target) return "General"
  return target
}


// ── New Form Dialog ───────────────────────────────────────────────────────────

type NewFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function NewFormDialog({ open, onOpenChange }: NewFormDialogProps) {
  const navigate = useNavigate()
  const depts = useMyDepartments()
  const create = useFormCreate()

  const [name, setName] = useState("")
  const [deptId, setDeptId] = useState("")
  const [target, setTarget] = useState<"none" | "cor" | "assignment" | "milestone" | "event" | "intake">("none")

  const reset = () => {
    setName("")
    setDeptId("")
    setTarget("none")
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const canSubmit = name.trim().length > 0 && deptId.length > 0 && !create.isPending

  const submit = () => {
    if (!canSubmit) return
    create.mutate(
      {
        name: name.trim(),
        department_id: deptId,
        target_entity: target === "none" ? null : target,
      },
      {
        onSuccess: (form) => {
          handleOpenChange(false)
          navigate(`/forms/${form.id}`)
        },
        onError: (err) => {
          toast.error(err.detail ?? "Failed to create form")
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New form</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="form-name">Name</Label>
            <Input
              id="form-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              placeholder="Form name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") submit()
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="form-dept">Department</Label>
            <Select value={deptId} onValueChange={setDeptId}>
              <SelectTrigger id="form-dept" aria-label="Department">
                <SelectValue placeholder="Select department" />
              </SelectTrigger>
              <SelectContent>
                {(depts.data ?? []).map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.code} — {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="form-target">Target</Label>
            <Select value={target} onValueChange={(v) => setTarget(v as "none" | "cor" | "assignment" | "milestone" | "event" | "intake")}>
              <SelectTrigger id="form-target" aria-label="Target">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="cor">Change order</SelectItem>
                <SelectItem value="assignment">Assignment</SelectItem>
                <SelectItem value="milestone">Milestone</SelectItem>
                <SelectItem value="event">Event</SelectItem>
                <SelectItem value="intake">Project intake</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={submit}
          >
            {create.isPending ? "Creating…" : "Create form"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Form row ──────────────────────────────────────────────────────────────────

function FormRow({ form }: { form: FormListItem }) {
  return (
    <Link
      to={`/forms/${form.id}`}
      className="flex items-center gap-4 rounded-md border bg-background px-4 py-3 text-sm hover:bg-[hsl(var(--row-hover))] transition-colors"
    >
      <span className="flex-1 font-medium truncate">{form.name}</span>
      <Badge tone={statusTone(form.status)} dot>
        {statusLabel(form.status)}
      </Badge>
      <span className="text-xs text-muted-foreground w-[100px] text-right shrink-0">
        {targetLabel(form.target_entity)}
      </span>
      <span className="text-xs text-muted-foreground w-[80px] text-right shrink-0">
        {relativeTime(form.updated_at)}
      </span>
    </Link>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function FormsListPage() {
  useTopbarCrumbs(useMemo(() => [{ label: "Forms" }], []))

  const { data: user } = useAuth()
  const canCreate = !!user && hasRole(user.roles, "project_editor")

  const list = useFormList()
  const items: FormListItem[] = list.data?.items ?? []

  const [dialogOpen, setDialogOpen] = useState(false)
  const [query, setQuery] = useState("")
  const q = query.trim().toLowerCase()
  const filtered = q
    ? items.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          targetLabel(f.target_entity).toLowerCase().includes(q),
      )
    : items

  return (
    <main className="space-y-5 px-6 py-7">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Forms</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configurable forms for capturing structured data.
          </p>
        </div>
        {canCreate && (
          <Button type="button" onClick={() => setDialogOpen(true)}>
            New form
          </Button>
        )}
      </div>

      {/* Search */}
      {!list.isLoading && !list.isError && items.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search forms…"
            aria-label="Search forms"
            className="pl-8"
          />
        </div>
      )}

      {/* List */}
      {list.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : list.isError ? (
        <p className="text-sm text-destructive">{list.error.detail}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No forms yet.</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No forms match “{query.trim()}”.
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((f) => (
            <FormRow key={f.id} form={f} />
          ))}
        </div>
      )}

      {canCreate && (
        <NewFormDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      )}
    </main>
  )
}
