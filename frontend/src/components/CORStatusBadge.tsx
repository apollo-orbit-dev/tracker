import { COR_STATUS_META, corStatusLabel } from "@/lib/cor-status"

export function CORStatusBadge({ status }: { status: string }) {
  const meta = (COR_STATUS_META as Record<string, { className: string }>)[status]
  const className = meta?.className ?? "bg-slate-200 text-slate-800"
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {corStatusLabel(status)}
    </span>
  )
}
