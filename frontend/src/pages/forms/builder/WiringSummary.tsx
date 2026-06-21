/**
 * WiringSummary — accent-tinted "On submit" banner shown above the build split.
 * Displays the form's purpose, CTA, and any mapped field→target bindings.
 */
import { CalendarDays, ClipboardList, FileSignature, Flag, FolderPlus, Inbox } from "lucide-react"

import { useFormTargets, type Form } from "@/api/forms"
import { useFieldDefs } from "@/api/templates"

type Accent = "slate" | "amber" | "blue" | "emerald" | "indigo" | "rose"

const WIRING_CONFIG: Record<string, {
  accent: Accent
  icon: React.ComponentType<{ size?: number; className?: string }>
  cta: string
  result: string
}> = {
  cor: {
    accent: "amber",
    icon: FileSignature,
    cta: "Submit change order",
    result: "Logs a COR against a project",
  },
  assignment: {
    accent: "blue",
    icon: ClipboardList,
    cta: "Create assignment",
    result: "Creates a task on a project",
  },
  milestone: {
    accent: "emerald",
    icon: Flag,
    cta: "Create milestone",
    result: "Adds a milestone to a project",
  },
  event: {
    accent: "indigo",
    icon: CalendarDays,
    cta: "Create event",
    result: "Adds a calendar event to the department",
  },
  intake: {
    accent: "rose",
    icon: FolderPlus,
    cta: "Create project",
    result: "Creates a new project from a template",
  },
}

const DEFAULT_CONFIG = {
  accent: "slate" as Accent,
  icon: Inbox,
  cta: "Collect only",
  result: "Nothing is written on submit",
}

type Props = {
  form: Form
}

export function WiringSummary({ form }: Props) {
  const { data: formTargets } = useFormTargets()
  // Intake custom-field targets resolve their labels from the bound template.
  const { data: fieldDefs } = useFieldDefs(
    form.target_entity === "intake" ? (form.target_template_id ?? undefined) : undefined,
  )
  const customDefLabels = new Map(
    (fieldDefs?.items ?? []).map((d) => [d.id, d.name]),
  )

  const config =
    form.target_entity && WIRING_CONFIG[form.target_entity]
      ? WIRING_CONFIG[form.target_entity]
      : DEFAULT_CONFIG

  const { accent, icon: Icon, cta, result } = config

  // Split fields into mapped vs unmapped
  const mappedFields = form.fields.filter((f) => f.target_key != null)
  const unmappedCount = form.fields.length - mappedFields.length
  const mappedCount = mappedFields.length

  // Build subline
  let subline = result
  if (mappedCount > 0) {
    subline += ` — fills ${mappedCount} mapped field${mappedCount === 1 ? "" : "s"}`
  }
  if (unmappedCount > 0) {
    subline += ` · ${unmappedCount} collected only`
  }

  // Group mapped fields by group name for display
  const targetDescriptor =
    form.target_entity && formTargets
      ? formTargets.targets[form.target_entity]
      : null

  const mappingRows = mappedFields.map((field) => {
    const targetField = targetDescriptor?.fields.find(
      (tf) => tf.key === field.target_key,
    )
    // Intake custom-field bindings (target_key = template def id) resolve from
    // the bound template rather than the static registry (Phase 20.5c).
    const customLabel =
      field.target_key != null ? customDefLabels.get(field.target_key) : undefined
    return {
      id: field.id,
      label: field.label || "Untitled field",
      targetLabel: targetField?.label ?? customLabel ?? field.target_key ?? "",
      // Section header; falls back to the target entity's label (#49).
      group:
        targetField?.group ??
        (customLabel ? "Custom fields" : targetDescriptor?.label ?? ""),
    }
  })

  // Cluster rows by group, preserving first-seen order.
  const groupedRows: { group: string; rows: typeof mappingRows }[] = []
  for (const row of mappingRows) {
    let bucket = groupedRows.find((g) => g.group === row.group)
    if (!bucket) {
      bucket = { group: row.group, rows: [] }
      groupedRows.push(bucket)
    }
    bucket.rows.push(row)
  }

  return (
    <div
      className="rounded-lg border p-4 mb-4 shadow-sm"
      style={{
        borderColor: `hsl(var(--tone-${accent}-dot) / .4)`,
      }}
    >
      {/* Head row */}
      <div className="flex items-start gap-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{
            backgroundColor: `hsl(var(--tone-${accent}-bg))`,
            color: `hsl(var(--tone-${accent}-fg))`,
          }}
        >
          <Icon size={16} />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">On submit · {cta}</p>
          <p className="text-xs text-muted-foreground">{subline}</p>
        </div>
      </div>

      {/* Mapping rows, clustered by target section — only when mapped (#49) */}
      {groupedRows.length > 0 && (
        <div className="mt-3 space-y-2 pl-11">
          {groupedRows.map((g) => (
            <div key={g.group} className="space-y-1">
              {g.group && (
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {g.group}
                </p>
              )}
              {g.rows.map((row) => (
                <div key={row.id} className="flex items-center gap-1.5 text-xs">
                  <span className="text-foreground font-medium truncate">
                    {row.label}
                  </span>
                  <span className="text-muted-foreground shrink-0">→</span>
                  <span className="text-muted-foreground truncate">
                    {row.targetLabel}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
