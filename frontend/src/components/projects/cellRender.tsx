// Phase 7.11 — shared project-table cell + header renderers, extracted
// byte-faithful from ProjectsViewPage (Task 6, behavior-frozen) so the
// embedded Saved View table block renders rows through the exact same
// code path as the page it embeds. Column keys use the view_columns
// grammar; parsing stays in lib/view_columns.
//
// SECURITY: every value renders as a React text node or component —
// no raw HTML anywhere in this module.
import { LifecycleBadge } from "@/components/LifecycleBadge"
import { type ProjectListItem, type RefLabels } from "@/api/projects"
import {
  type FieldDefLite,
  type MilestoneDefLite,
  columnLabel,
  parseColumnKey,
} from "@/lib/view_columns"
import { formatFieldValue } from "@/lib/format"

/** Header label for a column. For milestone planned/actual columns the
 * milestone name renders on line 1 and "(planned)" / "(actual)" on a
 * second line so the column doesn't get unnecessarily wide. */
export function renderHeaderLabel(
  columnKey: string,
  fieldDefs: FieldDefLite[],
  milestoneDefs: MilestoneDefLite[],
): React.ReactNode {
  const parsed = parseColumnKey(columnKey)
  if (
    parsed?.kind === "milestone" &&
    (parsed.mode === "planned" || parsed.mode === "actual")
  ) {
    const md = milestoneDefs.find((m) => m.id === parsed.id)
    const name = md?.name ?? "(removed milestone)"
    return (
      <span className="flex flex-col leading-tight">
        <span>{name}</span>
        <span className="text-xs font-normal text-muted-foreground">
          ({parsed.mode})
        </span>
      </span>
    )
  }
  return columnLabel(columnKey, fieldDefs, milestoneDefs)
}

export function renderCell(
  columnKey: string,
  item: ProjectListItem,
  refLabels: RefLabels | undefined,
  customFieldTypes: Record<string, string>,
): React.ReactNode {
  const parsed = parseColumnKey(columnKey)
  if (parsed === null) return "—"

  if (parsed.kind === "builtin") {
    switch (parsed.name) {
      case "project_number":
        return (
          <span className="font-mono text-xs">{item.project_number}</span>
        )
      case "client_number":
        return (
          <span className="font-mono text-xs text-muted-foreground">
            {item.client_project_number ?? "—"}
          </span>
        )
      case "title":
        return <span className="font-medium">{item.title}</span>
      case "lifecycle":
        return <LifecycleBadge state={item.lifecycle_state} />
      case "created_at":
      case "updated_at": {
        const v = parsed.name === "created_at" ? item.created_at : item.updated_at
        return (
          <span className="font-mono text-xs">
            {new Date(v).toISOString().slice(0, 10)}
          </span>
        )
      }
      default:
        return "—"
    }
  }

  if (parsed.kind === "custom_field") {
    const raw = item.custom_field_values?.[parsed.id]
    if (raw == null || raw === "") {
      return <span className="text-muted-foreground">—</span>
    }
    const ftype = customFieldTypes[parsed.id]
    if (ftype === "user_picker_single") {
      return refLabels?.users?.[String(raw)] ?? String(raw)
    }
    if (ftype === "user_picker_multi") {
      if (!Array.isArray(raw)) return String(raw)
      return raw
        .map((u) => refLabels?.users?.[String(u)] ?? String(u))
        .join(", ")
    }
    if (ftype === "contact_picker") {
      return refLabels?.contacts?.[String(raw)] ?? String(raw)
    }
    if (ftype === "project_reference") {
      return refLabels?.projects?.[String(raw)] ?? String(raw)
    }
    if (ftype === "client_reference") {
      return refLabels?.clients?.[String(raw)] ?? String(raw)
    }
    // Numeric types get currency / percent / thousands-separator
    // formatting via the shared helper. Non-numeric types fall through
    // to a stringified raw value (e.g. short_text, boolean).
    const formatted = formatFieldValue(raw, ftype)
    return formatted ?? <span className="text-muted-foreground">—</span>
  }

  // milestone
  const ms = item.milestones?.find(
    (m) => m.template_milestone_def_id === parsed.id,
  )
  if (!ms) return <span className="text-muted-foreground">—</span>
  const date = parsed.mode === "actual" ? ms.actual_date : ms.planned_date
  // For mode === "date" (single date_model), planned_date holds the value.
  return (
    <span className="font-mono text-xs">
      {date ?? <span className="text-muted-foreground">—</span>}
    </span>
  )
}
