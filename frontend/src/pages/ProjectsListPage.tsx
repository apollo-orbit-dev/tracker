import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronsUpDown,
  Columns2,
  Group,
  MoreHorizontal,
  Search,
  Table2,
} from "lucide-react"
import { type CSSProperties, useEffect, useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router"
import { toast } from "sonner"

import { Badge } from "@/components/Badge"
import { ImportProjectsSheet } from "@/components/ImportProjectsSheet"
import { ProjectDeleteDialog } from "@/components/ProjectDeleteDialog"
import { ProjectSheet } from "@/components/ProjectSheet"
import { Segmented } from "@/components/Segmented"
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
import { useDebouncedValue } from "@/hooks/useDebouncedValue"
import { useLocalStorage } from "@/hooks/useLocalStorage"
import { useMyDepartments } from "@/api/me"
import { type Project, useProjectList } from "@/api/projects"
import { useTaxonomyList } from "@/api/taxonomy"
import { useAuth } from "@/hooks/useAuth"
import { useTopbarCrumbs } from "@/hooks/useTopbarCrumbs"
import { PeekPanel } from "@/pages/projects-list/PeekPanel"
import { ProjectDetailPage } from "@/pages/ProjectDetailPage"
import {
  LIFECYCLE_STATES,
  lifecycleLabel,
  lifecycleTone,
} from "@/lib/lifecycle"
import { hasRole } from "@/lib/roles"

const ALL = "__all__"

const SORT_COLUMNS = ["project_number", "client_number", "title", "lifecycle"] as const
type SortColumn = (typeof SORT_COLUMNS)[number]
type SortDir = "asc" | "desc"

type Layout = "table" | "grouped" | "split"
const LAYOUT_VALUES: ReadonlyArray<Layout> = ["table", "grouped", "split"]
function isLayout(v: unknown): v is Layout {
  return typeof v === "string" && (LAYOUT_VALUES as ReadonlyArray<string>).includes(v)
}

const DENSITY_ROW_STYLE: CSSProperties = {
  height: "var(--row-h)",
  fontSize: "var(--fs-table)",
}
const DENSITY_CELL_STYLE: CSSProperties = {
  paddingTop: "var(--row-py)",
  paddingBottom: "var(--row-py)",
}

export function ProjectsListPage() {
  useTopbarCrumbs(useMemo(() => [{ label: "Projects" }], []))

  const { data: user } = useAuth()
  const navigate = useNavigate()
  const canCreate = !!user && hasRole(user.roles, "project_editor")
  const canImport = !!user && hasRole(user.roles, "department_manager")

  const [lifecycle, setLifecycle] = useState<string>(ALL)
  const [deptId, setDeptId] = useState<string>(ALL)
  const [clientId, setClientId] = useState<string>(ALL)
  const [disciplineId, setDisciplineId] = useState<string>(ALL)
  const [search, setSearch] = useState<string>("")
  const debouncedSearch = useDebouncedValue(search, 250)
  const [sort, setSort] = useState<SortColumn | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 15

  // Taxonomy feeds the three filter dropdowns. Department list is
  // scoped to what the user can see (auth-dependent); clients +
  // disciplines come from the admin taxonomy list (active rows only).
  const depts = useMyDepartments()
  const clients = useTaxonomyList("clients", false)
  const disciplines = useTaxonomyList("disciplines", false)

  // Any filter change snaps back to page 1 so the user doesn't end up
  // looking at "page 4 of 1" after narrowing the result set.
  useEffect(() => {
    setPage(1)
  }, [lifecycle, deptId, clientId, disciplineId, debouncedSearch, sort, sortDir])

  const list = useProjectList({
    lifecycle_state: lifecycle === ALL ? undefined : lifecycle,
    department_id: deptId === ALL ? undefined : deptId,
    client_id: clientId === ALL ? undefined : clientId,
    discipline_id: disciplineId === ALL ? undefined : disciplineId,
    q: debouncedSearch || undefined,
    sort: sort ?? undefined,
    sort_direction: sort ? sortDir : undefined,
    page,
    page_size: PAGE_SIZE,
  })
  const total = list.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const [editing, setEditing] = useState<Project | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [deleting, setDeleting] = useState<Project | null>(null)
  const [importOpen, setImportOpen] = useState(false)

  // 4.7.2: the command palette's `New project` action navigates to
  // /projects?new=1. Auto-open the create sheet and strip the flag so a
  // refresh doesn't re-open it.
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setEditing(null)
      setSheetOpen(true)
      const next = new URLSearchParams(searchParams)
      next.delete("new")
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

  // 4.7.3: layout choice persists across visits; ?selected= drives the
  // peek panel in Split mode.
  const [storedLayout, setStoredLayout] = useLocalStorage<string>(
    "tracker.projectsListLayout",
    "table",
  )
  // 4.8.16: Grouped layout is temporarily disabled pending a rework.
  // Treat a stale "grouped" persisted value as Table so users who had
  // it set previously aren't stranded on a disabled-but-selected tab.
  const layout: Layout =
    isLayout(storedLayout) && storedLayout !== "grouped"
      ? storedLayout
      : "table"
  const setLayout = (next: Layout) => setStoredLayout(next)

  const selectedId = searchParams.get("selected")
  const setSelectedId = (next: string | null) => {
    const params = new URLSearchParams(searchParams)
    if (next) params.set("selected", next)
    else params.delete("selected")
    setSearchParams(params, { replace: true })
  }

  // 4.7.3: collapsed group headers in Grouped mode. Local state, not URL.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(),
  )
  const toggleGroup = (label: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      next.has(label) ? next.delete(label) : next.add(label)
      return next
    })
  }

  const items = useMemo(() => list.data?.items ?? [], [list.data])

  // Resolved selected project (lookup against the current page of items).
  // Used by the Table/Grouped overlay; Split also uses its own copy
  // computed inside SplitBody.
  const selectedProject = items.find((p) => p.id === selectedId) ?? null

  // Cycle: not-sorted → asc → desc → not-sorted (back to backend default).
  const onSort = (col: SortColumn) => {
    if (sort !== col) {
      setSort(col)
      setSortDir("asc")
      return
    }
    if (sortDir === "asc") {
      setSortDir("desc")
      return
    }
    setSort(null)
    setSortDir("desc")
  }

  // 4.8.11: Table + Grouped layouts get a docked peek rail on the right
  // when a project is selected. Shrink the main column by the rail
  // width so the table still gets full clicks (no modal overlay).
  const peekDocked = layout !== "split" && selectedProject !== null

  return (
    <main
      className={
        "space-y-5 px-6 py-7 " + (peekDocked ? "lg:pr-[376px]" : "")
      }
    >
      {/* Page header. The breadcrumb in the topbar carries the section
          identity; the in-body h1 carries weight + the primary action. */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            All projects across templates and departments.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canImport && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setImportOpen(true)}
            >
              Import projects
            </Button>
          )}
          {canCreate && (
            <Button
              onClick={() => {
                setEditing(null)
                setSheetOpen(true)
              }}
            >
              New project
            </Button>
          )}
        </div>
      </div>

      {/* Filter row. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, Project #, client #"
            aria-label="Search projects"
            className="h-9 w-[280px] pl-7"
          />
        </div>
        <Select value={lifecycle} onValueChange={setLifecycle}>
          <SelectTrigger
            className="h-9 w-[170px]"
            aria-label="Lifecycle filter"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All states</SelectItem>
            {LIFECYCLE_STATES.map((s) => (
              <SelectItem key={s} value={s}>
                {lifecycleLabel(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={deptId} onValueChange={setDeptId}>
          <SelectTrigger
            className="h-9 w-[160px]"
            aria-label="Department filter"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All departments</SelectItem>
            {(depts.data ?? []).map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={clientId} onValueChange={setClientId}>
          <SelectTrigger
            className="h-9 w-[160px]"
            aria-label="Client filter"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All clients</SelectItem>
            {(clients.data?.items ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={disciplineId} onValueChange={setDisciplineId}>
          <SelectTrigger
            className="h-9 w-[160px]"
            aria-label="Discipline filter"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All disciplines</SelectItem>
            {(disciplines.data?.items ?? []).map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto">
          <Segmented<Layout>
            value={layout}
            onChange={setLayout}
            aria-label="Layout"
            options={[
              { value: "table", label: "Table", icon: <Table2 className="size-3.5" /> },
              {
                value: "grouped",
                label: "Grouped",
                icon: <Group className="size-3.5" />,
                disabled: true,
                title: "Grouped view is being reworked — coming soon.",
              },
              { value: "split", label: "Split", icon: <Columns2 className="size-3.5" /> },
            ]}
          />
        </div>
      </div>

      {list.isError && (
        <Alert variant="destructive">
          <AlertTitle>Couldn't load projects</AlertTitle>
          <AlertDescription>{list.error.detail}</AlertDescription>
        </Alert>
      )}

      {/* Body: Table | Grouped (same table with group rows) | Split (master-detail). */}
      {layout === "split" ? (
        <SplitBody
          isLoading={list.isLoading}
          items={items}
          selectedId={selectedId}
          onSelect={(id) => setSelectedId(id)}
        />
      ) : (
        <div className="rounded-md border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead
                  column="project_number"
                  label="Project #"
                  width="w-[160px]"
                  sort={sort}
                  sortDir={sortDir}
                  onSort={onSort}
                />
                <SortableHead
                  column="client_number"
                  label="Client #"
                  width="w-[140px]"
                  sort={sort}
                  sortDir={sortDir}
                  onSort={onSort}
                />
                <SortableHead
                  column="title"
                  label="Title"
                  sort={sort}
                  sortDir={sortDir}
                  onSort={onSort}
                />
                <TableHead className="w-[200px]">Template</TableHead>
                <SortableHead
                  column="lifecycle"
                  label="Status"
                  width="w-[140px]"
                  sort={sort}
                  sortDir={sortDir}
                  onSort={onSort}
                />
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading ? (
                <TableRow style={DENSITY_ROW_STYLE}>
                  <TableCell
                    colSpan={6}
                    className="text-center text-sm text-muted-foreground"
                    style={DENSITY_CELL_STYLE}
                  >
                    Loading…
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow style={DENSITY_ROW_STYLE}>
                  <TableCell
                    colSpan={6}
                    className="text-center text-sm text-muted-foreground"
                    style={DENSITY_CELL_STYLE}
                  >
                    No projects yet.
                  </TableCell>
                </TableRow>
              ) : layout === "grouped" ? (
                renderGrouped(items, collapsedGroups, toggleGroup, (p) =>
                  renderRow(p, navigate, canCreate, setEditing, setSheetOpen, setDeleting, setSelectedId, selectedId),
                )
              ) : (
                items.map((p) =>
                  renderRow(p, navigate, canCreate, setEditing, setSheetOpen, setDeleting, setSelectedId, selectedId),
                )
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {total > 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div>
            {total} total · Page {page} of {pageCount}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || list.isFetching}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={page >= pageCount || list.isFetching}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <ProjectSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        item={editing}
        onSuccess={() =>
          toast.success(editing ? "Project updated" : "Project created")
        }
      />
      <ProjectDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        item={deleting}
        onDeleted={() => toast.success("Project deleted")}
      />
      {canImport && (
        <ImportProjectsSheet
          open={importOpen}
          onOpenChange={setImportOpen}
        />
      )}

      {/* 4.8.11: docked peek rail for Table / Grouped layouts. The
          fixed-position aside sits below the topbar and right of the
          (also fixed) global sidebar, so it doesn't overlay the table.
          The table is still fully clickable; selecting another row just
          swaps the rail's contents. Split renders the peek inline as
          part of its master-detail body and skips this branch. */}
      {peekDocked && selectedProject && (
        <div
          className="
            fixed right-0 top-[52px] bottom-0 z-30 w-[360px]
            bg-background overflow-hidden
            hidden lg:block
          "
        >
          <PeekPanel
            key={selectedProject.id}
            project={selectedProject}
            onClose={() => setSelectedId(null)}
          />
        </div>
      )}
    </main>
  )
}

function SortableHead({
  column,
  label,
  width,
  sort,
  sortDir,
  onSort,
}: {
  column: SortColumn
  label: string
  width?: string
  sort: SortColumn | null
  sortDir: SortDir
  onSort: (col: SortColumn) => void
}) {
  const active = sort === column
  const Icon = !active ? ChevronsUpDown : sortDir === "asc" ? ArrowUp : ArrowDown
  return (
    <TableHead className={width}>
      <button
        type="button"
        onClick={() => onSort(column)}
        aria-label={`Sort by ${label}`}
        aria-sort={
          !active ? "none" : sortDir === "asc" ? "ascending" : "descending"
        }
        className="inline-flex items-center gap-1.5 font-medium text-muted-foreground hover:text-foreground"
      >
        {label}
        <Icon className="size-3 opacity-70" />
      </button>
    </TableHead>
  )
}

// One project row — shared between Table and Grouped layouts so the
// columns stay consistent. Pulled out (rather than inlined) once we
// needed to render rows underneath group-header rows in Grouped mode.
function renderRow(
  p: Project,
  navigate: (path: string) => void,
  canCreate: boolean,
  setEditing: (p: Project | null) => void,
  setSheetOpen: (open: boolean) => void,
  setDeleting: (p: Project | null) => void,
  onRowClick: (id: string) => void,
  selectedId: string | null,
) {
  // Selected row gets the design ref's row-sel background + an inset
  // primary left border (styles.css:258).
  const isSelected = selectedId === p.id
  return (
    <TableRow
      key={p.id}
      data-selected={isSelected || undefined}
      className={
        "cursor-pointer " +
        (isSelected
          ? "bg-[hsl(var(--row-sel))] shadow-[inset_2px_0_0_hsl(var(--primary))]"
          : "hover:bg-[hsl(var(--row-hover))]")
      }
      style={DENSITY_ROW_STYLE}
      onClick={() => onRowClick(p.id)}
    >
      <TableCell className="font-mono text-xs" style={DENSITY_CELL_STYLE}>
        {p.project_number}
      </TableCell>
      <TableCell
        className="font-mono text-xs text-muted-foreground"
        style={DENSITY_CELL_STYLE}
      >
        {p.client_project_number ?? "—"}
      </TableCell>
      <TableCell className="font-medium" style={DENSITY_CELL_STYLE}>
        {p.title}
      </TableCell>
      <TableCell className="font-mono text-xs" style={DENSITY_CELL_STYLE}>
        {p.template_intersection}
      </TableCell>
      <TableCell style={DENSITY_CELL_STYLE}>
        <Badge tone={lifecycleTone(p.lifecycle_state)} dot>
          {lifecycleLabel(p.lifecycle_state)}
        </Badge>
      </TableCell>
      <TableCell
        onClick={(e) => e.stopPropagation()}
        className="text-right"
        style={DENSITY_CELL_STYLE}
      >
        {canCreate && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Actions for ${p.project_number}`}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => navigate(`/projects/${p.id}`)}>
                Open
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  setEditing(p)
                  setSheetOpen(true)
                }}
              >
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setDeleting(p)}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </TableCell>
    </TableRow>
  )
}

// Group projects by lifecycle state (v1: only dimension supported).
// Group order matches the lifecycle order used elsewhere; inside each
// group the original sort order is preserved.
function groupByLifecycle(items: Project[]): Array<[string, Project[]]> {
  const map = new Map<string, Project[]>()
  for (const p of items) {
    const key = p.lifecycle_state
    let bucket = map.get(key)
    if (!bucket) {
      bucket = []
      map.set(key, bucket)
    }
    bucket.push(p)
  }
  return Array.from(map.entries())
}

function renderGrouped(
  items: Project[],
  collapsed: Set<string>,
  toggle: (label: string) => void,
  renderProjectRow: (p: Project) => React.ReactElement,
) {
  const groups = groupByLifecycle(items)
  return groups.flatMap(([state, rows]) => {
    const isCollapsed = collapsed.has(state)
    const headerRow = (
      <TableRow
        key={`__group-${state}`}
        className="bg-muted/30 hover:bg-muted/40"
      >
        <TableCell colSpan={6} className="py-1.5">
          <button
            type="button"
            onClick={() => toggle(state)}
            className="flex w-full items-center gap-2 text-left"
            aria-expanded={!isCollapsed}
            aria-label={`Toggle ${lifecycleLabel(state)} group`}
          >
            <ChevronDown
              aria-hidden
              className={`size-3.5 text-muted-foreground transition-transform ${
                isCollapsed ? "-rotate-90" : ""
              }`}
            />
            <Badge tone={lifecycleTone(state)} dot>
              {lifecycleLabel(state)}
            </Badge>
            <span className="text-xs text-muted-foreground">
              · {rows.length}
            </span>
          </button>
        </TableCell>
      </TableRow>
    )
    if (isCollapsed) return [headerRow]
    return [headerRow, ...rows.map(renderProjectRow)]
  })
}

// Split-mode body: condensed left rail + right peek panel for the
// selected row. Falls back to a "pick a row" prompt when nothing is
// selected. URL ?selected=PID drives the panel state.
function SplitBody({
  isLoading,
  items,
  selectedId,
  onSelect,
}: {
  isLoading: boolean
  items: Project[]
  selectedId: string | null
  onSelect: (id: string | null) => void
}) {
  const selected = items.find((p) => p.id === selectedId) ?? null
  return (
    <div
      className="grid h-[calc(100vh-320px)] overflow-hidden rounded-md border bg-background"
      style={{
        gridTemplateColumns: selected ? "minmax(260px,360px) 1fr" : "1fr",
      }}
    >
      <div className="overflow-auto">
        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No projects yet.</p>
        ) : (
          <ul>
            {items.map((p) => {
              const active = p.id === selectedId
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(p.id)}
                    aria-current={active}
                    className={`flex w-full items-center gap-2 border-b px-3 py-2 text-left hover:bg-[hsl(var(--row-hover))] ${
                      active ? "bg-muted/50" : ""
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`size-2 shrink-0 rounded-full bg-[hsl(var(--tone-${lifecycleTone(p.lifecycle_state)}-dot))]`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {p.title}
                      </span>
                      <span className="block truncate font-mono text-[11px] text-muted-foreground">
                        {p.project_number} · {p.template_intersection}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      {selected && (
        <div className="overflow-y-auto border-l">
          {/* 4.8.12: Split mode embeds the full project detail page so
              editors can hop between projects without leaving the list.
              `embedded` mode strips the page padding + fixed sidebar so
              the content fits naturally inside this column. */}
          <ProjectDetailPage key={selected.id} pid={selected.id} embedded />
        </div>
      )}
    </div>
  )
}
