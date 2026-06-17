// Phase 7.11 — embedded Saved View table block. Stores CONFIG only
// (validated server-side against the view_columns grammar); the data
// path is the existing GET /api/projects via useProjectList — identical
// auth/visibility to the Saved View page — with the page's
// expand_refs/expand_milestones expansions and its builtin-key → API
// sort-param mapping (SORT_PARAM_BY_KEY). Cells render exclusively
// through the shared cellRender module (no raw HTML); headers reuse
// renderHeaderLabel so milestone columns read "<name> (planned)".
//
// The configured body lives in an inner component so the list/defs
// hooks only mount once a config exists — an unconfigured block fetches
// nothing.
import { useMemo } from "react"
import { Settings2, Table2 } from "lucide-react"
import { Link, useNavigate } from "react-router"

import { type TableBlockConfig, type ViewBlock } from "@/api/views"
import { useProjectList } from "@/api/projects"
import { useFieldDefs, useMilestoneDefs } from "@/api/templates"
import {
  renderCell,
  renderHeaderLabel,
} from "@/components/projects/cellRender"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  SORT_PARAM_BY_KEY,
  type FieldDefLite,
  type MilestoneDefLite,
} from "@/lib/view_columns"

type Props = {
  block: ViewBlock
  onConfigure: () => void
}

export function TableBlock({ block, onConfigure }: Props) {
  const cfg = block.config as unknown as TableBlockConfig | null
  // 7.12 carry-over (b): a malformed stored config (no template_id)
  // renders the configure prompt instead of driving query params into
  // useProjectList. Defensive only — the server validates on save.
  if (!cfg || typeof cfg.template_id !== "string") {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-4 text-center">
        <Table2 aria-hidden className="size-6 text-muted-foreground" />
        <p className="max-w-[260px] text-xs text-muted-foreground">
          An embedded project table from one template — rows open the
          project. This block needs configuration before it shows data.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={onConfigure}>
          <Settings2 className="mr-1 size-3.5" /> Configure
        </Button>
      </div>
    )
  }
  return <ConfiguredTable cfg={cfg} />
}

function ConfiguredTable({ cfg }: { cfg: TableBlockConfig }) {
  const navigate = useNavigate()
  const limit = cfg.limit ?? 6

  const list = useProjectList({
    template_id: cfg.template_id,
    lifecycle_state: cfg.lifecycle_state ?? undefined,
    q: cfg.q ?? undefined,
    page_size: limit,
    // Stored sort keys use the view_columns grammar (builtin:*); the
    // API speaks the page's mapped param names — same dialect as
    // ProjectsViewPage, never re-derived.
    sort: cfg.sort ? SORT_PARAM_BY_KEY[cfg.sort] : undefined,
    sort_direction: cfg.sort_direction ?? undefined,
    // Phase 7.18 — project field conditions; useProjectList only emits
    // the `conditions` param when items are present (server requires
    // template_id alongside, which this configured block always has).
    conditions: cfg.conditions ?? undefined,
    expand_refs: true,
    expand_milestones: true,
  })
  const fieldsQ = useFieldDefs(cfg.template_id)
  const milestonesQ = useMilestoneDefs(cfg.template_id)

  const fieldDefs: FieldDefLite[] = useMemo(
    () =>
      (fieldsQ.data?.items ?? []).map((fd) => ({
        id: fd.id,
        name: fd.name,
        field_type: fd.field_type,
      })),
    [fieldsQ.data],
  )
  const milestoneDefs: MilestoneDefLite[] = useMemo(
    () =>
      (milestonesQ.data?.items ?? []).map((md) => ({
        id: md.id,
        name: md.name,
        date_model: md.date_model as "single" | "planned_actual",
      })),
    [milestonesQ.data],
  )
  const customFieldTypes: Record<string, string> = useMemo(() => {
    const out: Record<string, string> = {}
    for (const fd of fieldDefs) out[fd.id] = fd.field_type
    return out
  }, [fieldDefs])

  if (list.isLoading) {
    return <p className="px-4 text-sm text-muted-foreground">Loading…</p>
  }
  if (list.isError) {
    return <p className="px-4 text-sm text-red-700">{list.error.detail}</p>
  }

  const items = list.data?.items ?? []
  const total = list.data?.total ?? 0
  const refLabels = list.data?.ref_labels
  const columns = Array.isArray(cfg.columns) ? cfg.columns : []

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((k) => (
              <TableHead key={k}>
                {renderHeaderLabel(k, fieldDefs, milestoneDefs)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={Math.max(1, columns.length)}
                className="text-center text-sm text-muted-foreground"
              >
                No matching projects.
              </TableCell>
            </TableRow>
          ) : (
            items.map((p) => (
              <TableRow
                key={p.id}
                className="cursor-pointer odd:bg-muted/30"
                onClick={(e) => {
                  // Modifier clicks (new tab/window, select) and
                  // already-handled clicks keep their default meaning
                  // (7.12 carry-over (b)).
                  if (
                    e.defaultPrevented ||
                    e.metaKey ||
                    e.ctrlKey ||
                    e.shiftKey ||
                    e.altKey
                  ) {
                    return
                  }
                  navigate(`/projects/${p.id}`)
                }}
              >
                {columns.map((k, i) => (
                  <TableCell key={k}>
                    {i === 0 ? (
                      // A real link for semantics/middle-click (an <a>
                      // can't wrap a <tr>); the row onClick covers the
                      // rest of the row.
                      <Link
                        to={`/projects/${p.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="block"
                      >
                        {renderCell(k, p, refLabels, customFieldTypes)}
                      </Link>
                    ) : (
                      renderCell(k, p, refLabels, customFieldTypes)
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      {total > limit && (
        <div className="px-4 pt-1">
          <Link
            to={`/projects/view?template_id=${encodeURIComponent(cfg.template_id)}`}
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            View all {total} →
          </Link>
        </div>
      )}
    </>
  )
}
