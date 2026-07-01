import { SideBlock, SideRow } from "@/components/SideBlock"
import { ContactsSideList } from "@/pages/project-detail/ContactsSideList"
import type { ProjectDetail } from "@/api/projects"
import { formatMetricValue } from "@/lib/metric-value"

/**
 * Phase 4.3 — right sidebar for the project detail page.
 * Three blocks: Properties, Contacts, Activity. (No Budget — those values
 * live in custom fields, not first-class project columns.)
 */
type Props = {
  project: ProjectDetail
  canEdit: boolean
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function relativeDays(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const days = Math.round(
    (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24),
  )
  if (days <= 0) return "today"
  if (days === 1) return "yesterday"
  if (days < 30) return `${days} days ago`
  return formatDate(iso)
}

export function RightSidebar({ project, canEdit }: Props) {
  // 4.8.6 — pin to the right edge of the viewport on lg+. Topbar is
  // 52px tall (see Topbar.tsx), so top-[52px] lines the rail's top
  // edge up exactly. bottom-0 + overflow-y-auto give the rail a full-
  // height column with its own scroll context, independent of the
  // page's scroll. Mobile (`<lg`) stacks the rail inline as before.
  // 5.2: same metric source + formatter as the PeekPanel.
  const metricFields = (project.template_field_defs ?? [])
    .filter((fd) => fd.is_project_metric)
    .sort((a, b) => a.order_index - b.order_index)
  const customFieldValues =
    (project.custom_field_values as Record<string, unknown>) ?? {}

  return (
    <aside
      className="
        mt-6 space-y-4 p-4 bg-[hsl(var(--card-2))]
        lg:fixed lg:right-0 lg:top-[52px] lg:bottom-0 lg:z-30
        lg:mt-0 lg:w-[320px] lg:border-l
        lg:overflow-y-auto
      "
    >
      {metricFields.length > 0 && (
        <SideBlock label="Metrics">
          {metricFields.map((fd) => (
            <SideRow key={fd.id} label={fd.name}>
              <span className="text-xs tabular-nums">
                {formatMetricValue(customFieldValues[fd.id], fd.field_type)}
              </span>
            </SideRow>
          ))}
        </SideBlock>
      )}

      <SideBlock label="Properties">
        <SideRow label="Template">
          <span className="font-mono text-xs">
            {project.template_intersection}
          </span>
        </SideRow>
        <SideRow label="Project #">
          <span className="font-mono text-xs">
            {project.project_number}
          </span>
        </SideRow>
        <SideRow label="Client #">
          <span className="font-mono text-xs">
            {project.client_project_number ?? "—"}
          </span>
        </SideRow>
      </SideBlock>

      <ContactsSideList pid={project.id} canEdit={canEdit} />

      <SideBlock label="Activity">
        <SideRow label="Created">
          <span className="text-xs text-muted-foreground">
            {formatDate(project.created_at)}
          </span>
        </SideRow>
        <SideRow label="Last updated">
          <span className="text-xs text-muted-foreground">
            {relativeDays(project.updated_at)}
          </span>
        </SideRow>
      </SideBlock>
    </aside>
  )
}
