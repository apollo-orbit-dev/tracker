import { Link } from "react-router"

import { Avatar } from "@/components/Avatar"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { type DcdFilter, useRecentActivity } from "@/api/dashboard"

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const minutes = Math.round(ms / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

export function RecentActivityWidget({
  title,
  filter,
}: { title?: string | null; filter?: DcdFilter } = {}) {
  const q = useRecentActivity(filter)
  const items = q.data?.items ?? []
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title || "Recent activity"}</CardTitle>
        <CardDescription>Latest notes across your projects.</CardDescription>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : q.isError ? (
          <p className="text-sm text-red-700">{q.error.detail}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing recent.</p>
        ) : (
          <ul className="max-h-72 overflow-y-auto">
            {items.map((a, i) => (
              <li
                key={`${a.project_id}:${a.created_at}:${i}`}
                className="flex items-start gap-3 border-b py-2.5 last:border-b-0"
              >
                <Avatar name={a.author_name} size={28} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <Link
                      to={`/projects/${a.project_id}`}
                      className="truncate text-sm font-medium hover:underline"
                    >
                      {a.project_title}
                    </Link>
                    <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                      {relativeTime(a.created_at)}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    <span className="font-medium">{a.author_name}:</span>{" "}
                    {a.body_preview}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
