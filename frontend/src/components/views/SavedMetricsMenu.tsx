// Phase 7.12 — saved metrics library menu (plan decision 7). Mounted
// in MetricBuilder's header for EVERY consumer (metric cards, chart
// metrics, breakdown columns), so it's fully self-contained: own
// hooks, own save-as dialog, own toasts. Applying hands the caller a
// structuredClone of the stored config — a COPY, no live link, so
// deleting a saved metric later never affects blocks built from it.
// The stored dict flows through as-is (parsed as MetricDefinition);
// the builder's preview (/api/metrics/eval) and the block save
// (validate_block_config) re-validate it server-side. The save-as
// name mirrors the server's 1–120 char rule; validate_metric + the
// 50-per-user cap stay the boundary validators.
import { useId, useState } from "react"
import { BookMarked, Sigma, Trash2 } from "lucide-react"
import { toast } from "sonner"

import type { MetricDefinition } from "@/api/views"
import {
  useSavedMetricCreate,
  useSavedMetricDelete,
  useSavedMetrics,
} from "@/api/saved_metrics"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Props = {
  /** The builder's current draft — what "Save current as…" stores. */
  current: MetricDefinition
  /** Receives a copy of the chosen saved metric's config. */
  onApply: (m: MetricDefinition) => void
}

export function SavedMetricsMenu({ current, onApply }: Props) {
  const list = useSavedMetrics()
  const create = useSavedMetricCreate()
  const remove = useSavedMetricDelete()

  // The dialog is a SIBLING of the dropdown (not nested inside the
  // menu content) so the menu closing doesn't unmount it.
  const [saveOpen, setSaveOpen] = useState(false)
  const [name, setName] = useState("")
  const nameId = useId()

  // The server enforces the 50-per-user cap on create; mirror it
  // UI-side (plan decision 7) so a hand-rolled payload can't bloat
  // the menu.
  const items = (list.data?.items ?? []).slice(0, 50)

  const save = () => {
    create.mutate(
      { name: name.trim(), config: current },
      {
        onSuccess: (m) => {
          toast.success(`Saved metric "${m.name}"`)
          setSaveOpen(false)
          setName("")
        },
        onError: (e) => toast.error(e.detail),
      },
    )
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
          >
            <BookMarked className="mr-1 size-3.5" /> Saved metrics
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {list.isError ? (
            <p className="px-2 py-1.5 text-xs text-red-600">
              {list.error.detail}
            </p>
          ) : items.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              No saved metrics yet.
            </p>
          ) : (
            items.map((m) => (
              <DropdownMenuItem
                key={m.id}
                onSelect={() =>
                  // structuredClone: the cached object must never be
                  // handed out by reference (the builder mutates its
                  // draft); pass-through otherwise — server re-validates.
                  onApply(structuredClone(m.config) as MetricDefinition)
                }
              >
                <Sigma aria-hidden className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{m.name}</span>
                <button
                  type="button"
                  aria-label={`Delete saved metric ${m.name}`}
                  className="shrink-0 rounded p-0.5 text-destructive hover:bg-destructive/10"
                  onClick={(e) => {
                    // Don't trigger the item's apply (bubbling) or the
                    // menu's default close-on-select.
                    e.preventDefault()
                    e.stopPropagation()
                    remove.mutate(m.id, {
                      onError: (err) => toast.error(err.detail),
                    })
                  }}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setSaveOpen(true)}>
            Save current as…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save metric</DialogTitle>
            <DialogDescription>
              Adds the builder's current metric to your personal library.
              Applying it later copies it — edits and deletes never touch
              existing blocks.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={nameId}>Name</Label>
            <Input
              id={nameId}
              maxLength={120}
              placeholder="e.g. Missing kickoff"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              onClick={save}
              disabled={!name.trim() || create.isPending}
            >
              {create.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
