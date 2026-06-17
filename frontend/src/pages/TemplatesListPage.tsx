import { ChevronRight, MoreHorizontal, Search } from "lucide-react"
import { type CSSProperties, useMemo, useState } from "react"
import { Link } from "react-router"
import { toast } from "sonner"

import { TemplateDeleteDialog } from "@/components/TemplateDeleteDialog"
import { TemplateSheet } from "@/components/TemplateSheet"
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
import { useTaxonomyList } from "@/api/taxonomy"
import { type Template, useTemplateList } from "@/api/templates"

function indexById<T extends { id: string }>(items: T[] | undefined) {
  const map = new Map<string, T>()
  for (const item of items ?? []) map.set(item.id, item)
  return map
}

function codeFor<T extends { code: string }>(
  map: Map<string, T>,
  id: string,
): string {
  return map.get(id)?.code ?? "?"
}

const DENSITY_ROW_STYLE: CSSProperties = {
  height: "var(--row-h)",
  fontSize: "var(--fs-table)",
}
const DENSITY_CELL_STYLE: CSSProperties = {
  paddingTop: "var(--row-py)",
  paddingBottom: "var(--row-py)",
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-[5px] border bg-muted/40 px-1.5 py-0.5 font-mono text-[11.75px] text-foreground">
      {children}
    </span>
  )
}

export function TemplatesListPage() {
  useTopbarCrumbs(
    useMemo(() => [{ label: "Admin" }, { label: "Templates" }], []),
  )

  const list = useTemplateList()
  const depts = useMyDepartments()
  const clients = useTaxonomyList("clients", true)
  const disciplines = useTaxonomyList("disciplines", true)

  const deptMap = useMemo(() => indexById(depts.data), [depts.data])
  const clientMap = useMemo(
    () => indexById(clients.data?.items),
    [clients.data],
  )
  const disciplineMap = useMemo(
    () => indexById(disciplines.data?.items),
    [disciplines.data],
  )

  const [search, setSearch] = useState("")
  const [editing, setEditing] = useState<Template | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [deleting, setDeleting] = useState<Template | null>(null)

  const allItems = list.data?.items ?? []

  // Client-side filter across template name + the three intersection codes.
  const items = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return allItems
    return allItems.filter((t) => {
      if (t.name.toLowerCase().includes(q)) return true
      const codes = [
        codeFor(deptMap, t.department_id),
        codeFor(clientMap, t.client_id),
        codeFor(disciplineMap, t.discipline_id),
      ]
      return codes.some((c) => c.toLowerCase().includes(q))
    })
  }, [search, allItems, deptMap, clientMap, disciplineMap])

  const total = list.data?.total ?? 0

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-[20px] font-semibold tracking-[-0.01em]">
            Templates
          </h1>
          <p className="text-sm text-muted-foreground">
            Each Department × Client × Discipline intersection hosts one template.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null)
            setSheetOpen(true)
          }}
        >
          New template
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
            placeholder="Search by name or intersection…"
            className="pl-8"
            aria-label="Search templates"
          />
        </div>
        <span className="ml-auto rounded-md border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {search.trim() ? items.length : total}
          </span>{" "}
          {(search.trim() ? items.length : total) === 1
            ? "template"
            : "templates"}
          {search.trim() && total !== items.length ? (
            <span className="text-muted-foreground"> of {total}</span>
          ) : null}
        </span>
      </div>

      {list.isError && (
        <Alert variant="destructive">
          <AlertTitle>Couldn't load templates</AlertTitle>
          <AlertDescription>{list.error.detail}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Intersection</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="w-[180px]">Last updated</TableHead>
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-sm text-muted-foreground"
                >
                  Loading…
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-sm text-muted-foreground"
                >
                  {search.trim()
                    ? `No templates match "${search.trim()}".`
                    : "No templates yet."}
                </TableCell>
              </TableRow>
            ) : (
              items.map((t) => (
                <TableRow key={t.id} style={DENSITY_ROW_STYLE}>
                  <TableCell style={DENSITY_CELL_STYLE}>
                    <Link
                      to={`/admin/templates/${t.id}`}
                      className="inline-flex items-center gap-1.5 hover:underline"
                    >
                      <Chip>{codeFor(deptMap, t.department_id)}</Chip>
                      <ChevronRight
                        aria-hidden
                        className="size-3 text-muted-foreground"
                      />
                      <Chip>{codeFor(clientMap, t.client_id)}</Chip>
                      <ChevronRight
                        aria-hidden
                        className="size-3 text-muted-foreground"
                      />
                      <Chip>{codeFor(disciplineMap, t.discipline_id)}</Chip>
                    </Link>
                  </TableCell>
                  <TableCell
                    className="font-medium"
                    style={DENSITY_CELL_STYLE}
                  >
                    <Link
                      to={`/admin/templates/${t.id}`}
                      className="hover:underline"
                    >
                      {t.name}
                    </Link>
                  </TableCell>
                  <TableCell
                    className="text-xs text-muted-foreground tabular-nums"
                    style={DENSITY_CELL_STYLE}
                  >
                    <time
                      title={new Date(t.updated_at).toISOString()}
                      dateTime={t.updated_at}
                    >
                      {new Date(t.updated_at).toLocaleDateString()}
                    </time>
                  </TableCell>
                  <TableCell style={DENSITY_CELL_STYLE}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Actions for ${t.name}`}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link to={`/admin/templates/${t.id}`}>Manage</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => {
                            setEditing(t)
                            setSheetOpen(true)
                          }}
                        >
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => setDeleting(t)}
                        >
                          Archive
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

      <TemplateSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        item={editing}
        onSuccess={() =>
          toast.success(editing ? "Template renamed" : "Template created")
        }
      />
      <TemplateDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        item={deleting}
        onDeleted={() => toast.success("Template archived")}
      />
    </div>
  )
}
