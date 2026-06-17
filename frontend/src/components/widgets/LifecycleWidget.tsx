import { Badge } from "@/components/Badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { type DcdFilter, useLifecycleCounts } from "@/api/dashboard"
import { lifecycleLabel, lifecycleTone } from "@/lib/lifecycle"

const ORDER = ["draft", "active", "on_hold", "complete", "cancelled"] as const

export function LifecycleWidget({
  title,
  filter,
}: { title?: string | null; filter?: DcdFilter } = {}) {
  const q = useLifecycleCounts(filter)
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title || "Projects by lifecycle"}</CardTitle>
        <CardDescription>
          Live projects in your accessible departments.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : q.isError ? (
          <p className="text-sm text-red-700">{q.error.detail}</p>
        ) : (
          <div className="grid grid-cols-5 gap-2">
            {ORDER.map((s) => (
              <div
                key={s}
                className="flex flex-col items-center gap-2 rounded-md border bg-background p-2"
              >
                <Badge tone={lifecycleTone(s)} dot>
                  {lifecycleLabel(s)}
                </Badge>
                <span className="text-2xl font-semibold tabular-nums">
                  {q.data?.[s] ?? 0}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
