import { ArrowDown, ArrowUp, Columns, Download, Search } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router"
import { toast } from "sonner"

import { ColumnPickerSheet } from "@/components/ColumnPickerSheet"
import { ExportProjectsDialog } from "@/components/ExportProjectsDialog"
import { PeekPanel } from "@/pages/projects-list/PeekPanel"
import { useTopbarCrumbs } from "@/hooks/useTopbarCrumbs"
import {
  renderCell,
  renderHeaderLabel,
} from "@/components/projects/cellRender"
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
import { useDebouncedValue } from "@/hooks/useDebouncedValue"
import { useProjectList } from "@/api/projects"
import {
  useFieldDefs,
  useMilestoneDefs,
  useTemplateList,
} from "@/api/templates"
import { useMyDepartments } from "@/api/me"
import { useTaxonomyList } from "@/api/taxonomy"
import {
  type ViewColumnsPrefs,
  useViewColumns,
  useViewColumnsReset,
  useViewColumnsSave,
} from "@/api/view_columns"
import {
  DEFAULT_COLUMNS,
  DEFAULT_SORT,
  type FieldDefLite,
  type MilestoneDefLite,
  isSortable,
  sortParamForKey,
} from "@/lib/view_columns"
import { LIFECYCLE_STATES, lifecycleLabel } from "@/lib/lifecycle"

const ALL = "__all__"
const PAGE_SIZE = 15

// renderCell / renderHeaderLabel moved to components/projects/
// cellRender.tsx in Phase 7.11 (shared with the embedded Saved View
// table block) — behavior unchanged.

export function ProjectsViewPage() {
  useTopbarCrumbs(useMemo(() => [{ label: "Project Overviews" }], []))
  const [params, setParams] = useSearchParams()

  const templateId = params.get("template_id") ?? undefined

  const templates = useTemplateList()
  const depts = useMyDepartments()
  const clients = useTaxonomyList("clients", true)
  const disciplines = useTaxonomyList("disciplines", true)

  // Field defs and milestone defs for the selected template — used to
  // expand the column picker and label custom/milestone columns. These
  // hooks no-op when templateId is undefined.
  const fieldDefsQuery = useFieldDefs(templateId)
  const milestoneDefsQuery = useMilestoneDefs(templateId)

  const fieldDefs: FieldDefLite[] = useMemo(
    () =>
      (fieldDefsQuery.data?.items ?? []).map((fd) => ({
        id: fd.id,
        name: fd.name,
        field_type: fd.field_type,
      })),
    [fieldDefsQuery.data],
  )
  const milestoneDefs: MilestoneDefLite[] = useMemo(
    () =>
      (milestoneDefsQuery.data?.items ?? []).map((md) => ({
        id: md.id,
        name: md.name,
        date_model: md.date_model as "single" | "planned_actual",
      })),
    [milestoneDefsQuery.data],
  )
  const customFieldTypes: Record<string, string> = useMemo(() => {
    const out: Record<string, string> = {}
    for (const fd of fieldDefs) out[fd.id] = fd.field_type
    return out
  }, [fieldDefs])

  const prefs = useViewColumns(templateId)
  const save = useViewColumnsSave(templateId ?? "")
  const reset = useViewColumnsReset(templateId ?? "")

  const effectivePrefs: ViewColumnsPrefs = useMemo(() => {
    if (prefs.data === null || prefs.data === undefined) {
      return {
        columns: DEFAULT_COLUMNS,
        sort_key: DEFAULT_SORT.sort_key,
        sort_direction: DEFAULT_SORT.sort_direction,
      }
    }
    return prefs.data
  }, [prefs.data])

  const [lifecycle, setLifecycle] = useState<string>(ALL)
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebouncedValue(search, 250)
  const [page, setPage] = useState(1)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)

  useEffect(() => {
    setPage(1)
  }, [lifecycle, debouncedSearch, templateId])

  useEffect(() => {
    if (save.error) toast.error(save.error.detail || "Couldn't save columns")
  }, [save.error])
  useEffect(() => {
    if (reset.error) toast.error(reset.error.detail || "Couldn't reset columns")
  }, [reset.error])

  const sortApiParam = effectivePrefs.sort_key
    ? sortParamForKey(effectivePrefs.sort_key)
    : undefined

  const list = useProjectList(
    templateId
      ? {
          template_id: templateId,
          lifecycle_state: lifecycle === ALL ? undefined : lifecycle,
          q: debouncedSearch || undefined,
          page,
          page_size: PAGE_SIZE,
          sort: sortApiParam,
          sort_direction: effectivePrefs.sort_direction ?? undefined,
          expand_refs: true,
          expand_milestones: true,
        }
      : {},
  )
  const total = list.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const items = list.data?.items ?? []
  const refLabels = list.data?.ref_labels

  // ?selected drives a docked peek rail (same pattern as /projects), resolved
  // against the current page of items — no extra fetch for the list row.
  const selectedId = params.get("selected")
  const selectedProject = items.find((p) => p.id === selectedId) ?? null
  const peekDocked = selectedProject !== null
  function setSelectedId(next: string | null) {
    const p = new URLSearchParams(params)
    if (next) p.set("selected", next)
    else p.delete("selected")
    setParams(p)
  }

  function persist(next: Partial<ViewColumnsPrefs>) {
    if (!templateId) return
    save.mutate({
      columns: next.columns ?? effectivePrefs.columns,
      sort_key:
        next.sort_key !== undefined ? next.sort_key : effectivePrefs.sort_key,
      sort_direction:
        next.sort_direction !== undefined
          ? next.sort_direction
          : effectivePrefs.sort_direction,
    })
  }

  function handleHeaderClick(columnKey: string) {
    if (!isSortable(columnKey)) return
    const currentKey = effectivePrefs.sort_key
    const currentDir = effectivePrefs.sort_direction
    if (currentKey !== columnKey) {
      persist({ sort_key: columnKey, sort_direction: "asc" })
      return
    }
    // Same column — cycle asc → desc → null.
    if (currentDir === "asc") {
      persist({ sort_direction: "desc" })
    } else if (currentDir === "desc") {
      persist({ sort_key: null, sort_direction: null })
    } else {
      persist({ sort_key: columnKey, sort_direction: "asc" })
    }
  }

  const savingState: "idle" | "saving" | "saved" = save.isPending
    ? "saving"
    : save.isSuccess
      ? "saved"
      : "idle"

  // ---- empty / loading states ------------------------------------------

  const pageTitle = (
    <h1 className="text-[20px] font-semibold tracking-[-0.01em]">
      Project Overviews
    </h1>
  )

  if (!templateId) {
    return (
      <main className="space-y-5 px-6 py-7">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {pageTitle}
          <TemplateSelect
            templates={templates.data}
            depts={depts.data}
            clients={clients.data?.items}
            disciplines={disciplines.data?.items}
            value={templateId}
            onChange={(id) => setParams({ template_id: id })}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Pick a template from the dropdown to start viewing.
        </p>
      </main>
    )
  }

  return (
    <main
      className={"space-y-5 px-6 py-7 " + (peekDocked ? "lg:pr-[376px]" : "")}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {pageTitle}
        <div className="flex flex-wrap items-center gap-2">
          <TemplateSelect
            templates={templates.data}
            depts={depts.data}
            clients={clients.data?.items}
            disciplines={disciplines.data?.items}
            value={templateId}
            onChange={(id) => setParams({ template_id: id })}
          />
          <Button
            variant="outline"
            onClick={() => setPickerOpen(true)}
            aria-label="Open column picker"
          >
            <Columns className="mr-2 size-4" />
            Columns
          </Button>
          <Button
            variant="outline"
            onClick={() => setExportOpen(true)}
            aria-label="Export projects"
          >
            <Download className="mr-2 size-4" />
            Export
          </Button>
        </div>
      </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm text-muted-foreground">
              {list.data ? `${list.data.total} total` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search title, Project #, client #"
                aria-label="Search projects"
                className="w-[260px] pl-7"
              />
            </div>
            <Select value={lifecycle} onValueChange={setLifecycle}>
              <SelectTrigger className="w-[170px]" aria-label="Lifecycle filter">
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
          </div>
        </div>

        {list.isError && (
          <Alert variant="destructive">
            <AlertTitle>Couldn't load projects</AlertTitle>
            <AlertDescription>{list.error.detail}</AlertDescription>
          </Alert>
        )}

        <div className="rounded-md border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                {effectivePrefs.columns.map((k) => {
                  const sortable = isSortable(k)
                  const isSorted = effectivePrefs.sort_key === k
                  return (
                    <TableHead
                      key={k}
                      onClick={() => sortable && handleHeaderClick(k)}
                      className={sortable ? "cursor-pointer select-none" : ""}
                    >
                      <span className="inline-flex items-center gap-1">
                        {renderHeaderLabel(k, fieldDefs, milestoneDefs)}
                        {isSorted && effectivePrefs.sort_direction === "asc" && (
                          <ArrowUp className="size-3" />
                        )}
                        {isSorted && effectivePrefs.sort_direction === "desc" && (
                          <ArrowDown className="size-3" />
                        )}
                      </span>
                    </TableHead>
                  )
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={Math.max(1, effectivePrefs.columns.length)}
                    className="text-center text-sm text-muted-foreground"
                  >
                    Loading…
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={Math.max(1, effectivePrefs.columns.length)}
                    className="text-center text-sm text-muted-foreground"
                  >
                    {debouncedSearch || lifecycle !== ALL
                      ? "No projects match your filters."
                      : "No projects yet in this template."}
                  </TableCell>
                </TableRow>
              ) : (
                items.map((p) => (
                  <TableRow
                    key={p.id}
                    data-state={selectedId === p.id ? "selected" : undefined}
                    className="cursor-pointer odd:bg-muted/30"
                    onClick={() => setSelectedId(p.id)}
                  >
                    {effectivePrefs.columns.map((k) => (
                      <TableCell key={k}>
                        {renderCell(k, p, refLabels, customFieldTypes)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {total > 0 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div>
              Page {page} of {pageCount} · {total} total
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

        <ColumnPickerSheet
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          visible={effectivePrefs.columns}
          fieldDefs={fieldDefs}
          milestoneDefs={milestoneDefs}
          onChange={(next) => persist({ columns: next })}
          onReset={() => reset.mutate()}
          savingState={savingState}
        />
        <ExportProjectsDialog
          open={exportOpen}
          onOpenChange={setExportOpen}
          templateId={templateId}
          visibleColumns={effectivePrefs.columns}
          fieldDefs={fieldDefs}
          milestoneDefs={milestoneDefs}
          filters={{
            lifecycle_state: lifecycle === ALL ? undefined : lifecycle,
            q: debouncedSearch || undefined,
            sort: sortApiParam,
            sort_direction: effectivePrefs.sort_direction ?? undefined,
          }}
        />

        {/* Docked peek rail — same pattern as /projects (Table/Grouped).
            Fixed below the topbar, right of the global sidebar; selecting
            another row swaps the rail contents. */}
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

// ---- helpers ----------------------------------------------------------

function TemplateSelect({
  templates,
  depts,
  clients,
  disciplines,
  value,
  onChange,
}: {
  templates?: {
    items: {
      id: string
      department_id: string
      client_id: string
      discipline_id: string
    }[]
  }
  depts?: { id: string; code: string }[]
  clients?: { id: string; code: string }[]
  disciplines?: { id: string; code: string }[]
  value: string | undefined
  onChange: (id: string) => void
}) {
  return (
    <Select value={value ?? ""} onValueChange={onChange}>
      <SelectTrigger className="w-[260px]" aria-label="Template">
        <SelectValue placeholder="Pick a template…" />
      </SelectTrigger>
      <SelectContent>
        {templates?.items.map((t) => {
          const d = depts?.find((x) => x.id === t.department_id)?.code ?? "?"
          const c = clients?.find((x) => x.id === t.client_id)?.code ?? "?"
          const x =
            disciplines?.find((y) => y.id === t.discipline_id)?.code ?? "?"
          return (
            <SelectItem key={t.id} value={t.id}>
              {d} · {c} · {x}
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}

