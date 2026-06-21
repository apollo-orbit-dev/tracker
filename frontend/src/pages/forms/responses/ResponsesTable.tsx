/**
 * ResponsesTable — displays submissions for a form with a status filter.
 *
 * Status filter tabs: All / Pending / Approved / Rejected
 * Table columns: submitter, status badge, submitted-at (relative), row action.
 * Clicking a row opens the ReviewSheet flyout.
 */
import { useState } from "react"

import { Badge } from "@/components/Badge"
import { Button } from "@/components/ui/button"
import { relativeTime } from "@/lib/relativeTime"
import { useSubmissionList } from "@/api/forms"
import type { SubmissionListItem } from "@/api/forms"
import { ReviewSheet } from "./ReviewSheet"

// ── Status badge ──────────────────────────────────────────────────────────────

function statusTone(status: string) {
  switch (status) {
    case "pending":
      return "amber" as const
    case "approved":
      return "emerald" as const
    case "rejected":
      return "rose" as const
    default:
      return "slate" as const
  }
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={statusTone(status)}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  )
}

// ── Filter tabs ───────────────────────────────────────────────────────────────

type StatusFilter = "all" | "pending" | "approved" | "rejected"
const FILTER_LABELS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
]

// ── Main component ────────────────────────────────────────────────────────────

type Props = {
  formId: string
}

export function ResponsesTable({ formId }: Props) {
  const [filter, setFilter] = useState<StatusFilter>("all")
  const [selectedSid, setSelectedSid] = useState<string | null>(null)

  const statusParam = filter === "all" ? undefined : filter
  const { data, isLoading, isError, error } = useSubmissionList(formId, statusParam)

  const items: SubmissionListItem[] = data?.items ?? []

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex gap-1 rounded-md border bg-muted p-1 w-fit">
        {FILTER_LABELS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={[
              "rounded px-3 py-1 text-sm font-medium transition-colors",
              filter === value
                ? "bg-background shadow text-foreground"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Table area */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : isError ? (
        <p className="text-sm text-destructive">
          {error?.detail ?? "Failed to load submissions"}
        </p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No{filter !== "all" ? ` ${filter}` : ""} submissions yet.
        </p>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground">
                <th className="px-4 py-2 text-left font-medium">Submitter</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2 text-left font-medium">Submitted</th>
                <th className="px-4 py-2 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((sub, i) => (
                <tr
                  key={sub.id}
                  className={[
                    "cursor-pointer hover:bg-muted/40 transition-colors",
                    i > 0 ? "border-t" : "",
                  ].join(" ")}
                  onClick={() => setSelectedSid(sub.id)}
                >
                  <td className="px-4 py-3 text-sm">
                    {sub.submitted_by_name ?? sub.submitted_by}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={sub.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {relativeTime(sub.created_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedSid(sub.id)
                      }}
                    >
                      {sub.status === "pending" ? "Review" : "View"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Review flyout */}
      <ReviewSheet
        formId={formId}
        sid={selectedSid}
        open={selectedSid !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedSid(null)
        }}
      />
    </div>
  )
}
