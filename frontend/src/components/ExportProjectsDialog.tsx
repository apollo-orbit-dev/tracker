import { Download } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  type ExportFormat,
  type MultiFilter,
  useProjectExport,
} from "@/api/projects"
import {
  type FieldDefLite,
  type MilestoneDefLite,
  availableColumnsForTemplate,
  columnLabel,
} from "@/lib/view_columns"

export type ExportProjectsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  templateId: string
  visibleColumns: string[]
  fieldDefs: FieldDefLite[]
  milestoneDefs: MilestoneDefLite[]
  // Filter context shown in the summary line + forwarded to the request.
  filters: {
    lifecycle_state?: MultiFilter
    q?: string
    sort?: string
    sort_direction?: "asc" | "desc"
  }
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function ExportProjectsDialog({
  open,
  onOpenChange,
  templateId,
  visibleColumns,
  fieldDefs,
  milestoneDefs,
  filters,
}: ExportProjectsDialogProps) {
  const [format, setFormat] = useState<ExportFormat>("xlsx")
  const [selected, setSelected] = useState<string[]>(visibleColumns)
  const exportMutation = useProjectExport()

  // Re-seed selection whenever the dialog re-opens so it always
  // mirrors the page's current visible columns.
  useEffect(() => {
    if (open) {
      setSelected(visibleColumns)
      setFormat("xlsx")
    }
  }, [open, visibleColumns])

  const allColumns = useMemo(
    () => availableColumnsForTemplate(fieldDefs, milestoneDefs),
    [fieldDefs, milestoneDefs],
  )

  function toggle(key: string) {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    )
  }

  async function handleExport() {
    if (selected.length === 0) {
      toast.error("Pick at least one column")
      return
    }
    try {
      const { blob, filename } = await exportMutation.mutateAsync({
        templateId,
        format,
        columns: selected,
        lifecycle_state: filters.lifecycle_state,
        q: filters.q,
        sort: filters.sort,
        sort_direction: filters.sort_direction,
      })
      triggerDownload(blob, filename)
      onOpenChange(false)
    } catch (e) {
      const detail = e instanceof Error ? e.message : "Export failed"
      toast.error(detail)
    }
  }

  const lifecycleList = Array.isArray(filters.lifecycle_state)
    ? filters.lifecycle_state
    : filters.lifecycle_state
      ? [filters.lifecycle_state]
      : []
  const filterSummary = [
    filters.q ? `q="${filters.q}"` : null,
    lifecycleList.length ? `status=${lifecycleList.join(", ")}` : null,
    filters.sort
      ? `sort=${filters.sort} ${filters.sort_direction ?? "desc"}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Export projects</DialogTitle>
          <DialogDescription>
            Downloads the rows currently matching the page's filters.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 overflow-y-auto pr-1">
          <div className="space-y-2">
            <Label>Format</Label>
            <div
              className="inline-flex rounded-md border bg-muted/30 p-0.5"
              role="radiogroup"
              aria-label="Export format"
            >
              <Button
                type="button"
                variant={format === "csv" ? "default" : "ghost"}
                size="sm"
                onClick={() => setFormat("csv")}
                role="radio"
                aria-checked={format === "csv"}
              >
                CSV
              </Button>
              <Button
                type="button"
                variant={format === "xlsx" ? "default" : "ghost"}
                size="sm"
                onClick={() => setFormat("xlsx")}
                role="radio"
                aria-checked={format === "xlsx"}
              >
                XLSX
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Columns</Label>
              <span className="text-xs text-muted-foreground">
                {selected.length} of {allColumns.length} selected
              </span>
            </div>
            <div className="max-h-[280px] overflow-y-auto rounded-md border bg-background">
              <ul className="divide-y">
                {allColumns.map((k) => {
                  const checked = selected.includes(k)
                  const label = columnLabel(k, fieldDefs, milestoneDefs)
                  return (
                    <li
                      key={k}
                      className="flex items-center gap-2 px-3 py-2 text-sm"
                    >
                      <Checkbox
                        id={`export-col-${k}`}
                        checked={checked}
                        onCheckedChange={() => toggle(k)}
                        aria-label={`Include ${label}`}
                      />
                      <Label
                        htmlFor={`export-col-${k}`}
                        className="font-normal"
                      >
                        {label}
                      </Label>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>

          {filterSummary && (
            <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Filters: {filterSummary}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={exportMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            disabled={exportMutation.isPending || selected.length === 0}
          >
            <Download className="mr-2 size-4" />
            {exportMutation.isPending ? "Exporting…" : "Export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
