import { Settings2, Sigma } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useFieldAggregate } from "@/api/dashboard"
import type { FieldAggregateConfig } from "@/api/dashboard_widgets"
import { formatFieldValue } from "@/lib/format"

type Props = {
  config: FieldAggregateConfig | null
  title?: string | null
  onConfigure?: () => void
}

function formatTotal(total: string, fieldType: string): string {
  return formatFieldValue(total, fieldType) ?? total
}

function AggregateRow({
  fieldName,
  total,
  fieldType,
  projectCount,
  isLast,
}: {
  fieldName: string
  total: string
  fieldType: string
  projectCount: number
  isLast: boolean
}) {
  return (
    <div
      className={`flex items-start justify-between gap-3 py-2 ${
        isLast ? "" : "border-b"
      }`}
    >
      <span className="min-w-0 truncate text-sm text-muted-foreground">
        {fieldName}
      </span>
      <div className="flex flex-col items-end">
        <span className="text-sm font-semibold tabular-nums">
          {formatTotal(total, fieldType)}
        </span>
        <span className="text-[10px] text-muted-foreground">
          across {projectCount} project{projectCount === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  )
}

export function FieldAggregateWidget({ config, title, onConfigure }: Props) {
  const isConfigured = !!config?.template_id && !!config?.primary_field_id
  const q = useFieldAggregate(
    isConfigured ? config!.template_id : undefined,
    isConfigured ? config!.primary_field_id : undefined,
    isConfigured ? config!.secondary_field_id ?? undefined : undefined,
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title || "Field aggregate"}</CardTitle>
        <CardDescription>
          Sum of numeric custom fields across projects on one template.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!isConfigured ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <Sigma
              aria-hidden
              className="size-6 text-muted-foreground"
            />
            <p className="max-w-[260px] text-xs text-muted-foreground">
              Sum numeric custom fields across projects on one template.
              This widget needs configuration before it shows data.
            </p>
            {onConfigure && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onConfigure}
              >
                <Settings2 className="mr-1 size-3.5" />
                Configure
              </Button>
            )}
          </div>
        ) : q.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : q.isError ? (
          <p className="text-sm text-red-700">{q.error.detail}</p>
        ) : q.data ? (
          <div>
            <AggregateRow
              fieldName={q.data.primary.field_name}
              total={q.data.primary.total}
              fieldType={q.data.primary.field_type}
              projectCount={q.data.primary.project_count}
              isLast={!q.data.secondary}
            />
            {q.data.secondary && (
              <AggregateRow
                fieldName={q.data.secondary.field_name}
                total={q.data.secondary.total}
                fieldType={q.data.secondary.field_type}
                projectCount={q.data.secondary.project_count}
                isLast
              />
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
