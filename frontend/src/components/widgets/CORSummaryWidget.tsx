import { Badge } from "@/components/Badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { type DcdFilter, useCORSummary } from "@/api/dashboard"
import { corStatusLabel, corStatusTone } from "@/lib/cors"

function formatAmount(amt: string): string {
  // amt is a Decimal serialized as string. Render in USD with grouping
  // and no fractional cents — the dashboard surface is exposure-at-a-
  // glance, not accounting.
  const n = Number(amt)
  if (!Number.isFinite(n)) return amt
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  })
}

export function CORSummaryWidget({
  title,
  filter,
}: { title?: string | null; filter?: DcdFilter } = {}) {
  const q = useCORSummary(filter)
  const rows = q.data?.by_status ?? []

  // Grand totals for the stacked bar + footer row.
  const grandTotal = rows.reduce((acc, r) => acc + Number(r.total_amount || 0), 0)
  const grandCount = rows.reduce((acc, r) => acc + r.count, 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title || "CORs"}</CardTitle>
        <CardDescription>
          Change orders by status, with dollar totals.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : q.isError ? (
          <p className="text-sm text-red-700">{q.error.detail}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No CORs yet.</p>
        ) : (
          <div className="space-y-2.5">
            {/* Stacked horizontal bar — suppressed when grand total is
                $0 (every COR is empty) so NaN-width segments don't leave
                an empty rail. */}
            {grandTotal > 0 && (
              <div
                role="presentation"
                aria-hidden
                className="flex h-1.5 overflow-hidden rounded-full bg-muted"
              >
                {rows.map((r) => {
                  const amount = Number(r.total_amount || 0)
                  if (amount <= 0) return null
                  const pct = (amount / grandTotal) * 100
                  return (
                    <span
                      key={r.status}
                      data-testid="cor-bar-segment"
                      title={`${corStatusLabel(r.status)}: ${formatAmount(r.total_amount)}`}
                      style={{
                        width: `${pct}%`,
                        background: `hsl(var(--tone-${corStatusTone(r.status)}-dot))`,
                      }}
                    />
                  )
                })}
              </div>
            )}

            <ul className="space-y-1">
              {rows.map((r) => (
                <li
                  key={r.status}
                  className="flex items-baseline justify-between py-1.5"
                >
                  <Badge tone={corStatusTone(r.status)} dot>
                    {corStatusLabel(r.status)}
                  </Badge>
                  <div className="flex items-baseline gap-3">
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {r.count} COR{r.count === 1 ? "" : "s"}
                    </span>
                    <span className="text-sm font-medium tabular-nums">
                      {formatAmount(r.total_amount)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>

            {/* Total exposure footer. */}
            <div className="flex items-baseline justify-between border-t pt-2 text-sm">
              <span className="font-semibold">Total exposure</span>
              <div className="flex items-baseline gap-3">
                <span className="text-xs text-muted-foreground tabular-nums">
                  {grandCount} COR{grandCount === 1 ? "" : "s"}
                </span>
                <span className="font-semibold tabular-nums">
                  {formatAmount(String(grandTotal))}
                </span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
