// Phase 7.4 — block config sheet. Phase 7.10 split it into this shell
// (title / width / accent, error Alert, footer Save) plus one config
// section per block type under ./sections/ — each section owns its
// draft state and reports `{ config, valid, hint }` upward on every
// change (see sections/shared.tsx for the contract). The section is
// mounted keyed by block.id, so reopening for a different block
// remounts it and resets the draft. Saves through useBlockUpdate; the
// server re-validates everything (validate_block_config →
// validate_metric / _resolve_group_by) and 422 reasons surface in a
// destructive Alert. Save is disabled while the section reports
// invalid (incomplete metric, unset/stale group-by, empty column
// label, half-filled thresholds — gating unchanged from 7.4/7.7/7.8).
import { useState, type ComponentType } from "react"

import { type ViewBlock, useBlockUpdate } from "@/api/views"
import { Segmented } from "@/components/Segmented"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

import { BreakdownConfigSection } from "./sections/BreakdownConfigSection"
import { ChartConfigSection } from "./sections/ChartConfigSection"
import { MetricConfigSection } from "./sections/MetricConfigSection"
import { TableConfigSection } from "./sections/TableConfigSection"
import { TextConfigSection } from "./sections/TextConfigSection"
import type { SectionProps, SectionState } from "./sections/shared"

const ACCENTS: { value: ViewBlock["accent"]; swatch: string }[] = [
  { value: "indigo", swatch: "bg-indigo-500" },
  { value: "blue", swatch: "bg-blue-500" },
  { value: "emerald", swatch: "bg-emerald-500" },
  { value: "amber", swatch: "bg-amber-500" },
  { value: "rose", swatch: "bg-rose-500" },
  { value: "slate", swatch: "bg-slate-500" },
]

const TYPE_LABEL: Record<ViewBlock["block_type"], string> = {
  metric: "metric card",
  chart: "chart",
  breakdown: "breakdown table",
  table: "Saved View table",
  text: "text block",
}

// Exhaustively typed (7.10 review carry-over): adding a block type
// without a config section is a compile error here.
const SECTIONS: Record<ViewBlock["block_type"], ComponentType<SectionProps>> = {
  text: TextConfigSection,
  metric: MetricConfigSection,
  chart: ChartConfigSection,
  breakdown: BreakdownConfigSection,
  table: TableConfigSection,
}

type WidthChoice = "1" | "2" | "4"

type Props = {
  viewId: string
  block: ViewBlock
  onClose: () => void
}

export function BlockConfigSheet({ viewId, block, onClose }: Props) {
  const update = useBlockUpdate(viewId)

  const [title, setTitle] = useState(block.title ?? "")
  const [width, setWidth] = useState<WidthChoice>(String(block.width) as WidthChoice)
  const [accent, setAccent] = useState<ViewBlock["accent"]>(block.accent)
  // Latest {config, valid, hint} reported by the mounted section.
  const [section, setSection] = useState<SectionState | null>(null)

  // Reset the shell draft when the sheet renders for a different block
  // — synchronously, DURING render (React's "adjusting state during
  // render" pattern), so the section state is structurally null until
  // the remounted section (key={block.id}) fires its unconditional
  // mount onState. No effect, no frame where stale section state could
  // gate Save for the wrong block.
  const [prevBlockId, setPrevBlockId] = useState(block.id)
  if (prevBlockId !== block.id) {
    setPrevBlockId(block.id)
    setTitle(block.title ?? "")
    setWidth(String(block.width) as WidthChoice)
    setAccent(block.accent)
    setSection(null)
    // Drop a stale error Alert from the previous block's save attempt.
    // TanStack batches the notification via a microtask, so this is
    // safe in the render phase.
    update.reset()
  }

  const Section = SECTIONS[block.block_type]
  const saveDisabled = update.isPending || !section?.valid

  const onSave = () => {
    const body: Parameters<typeof update.mutate>[0] = {
      blockId: block.id,
      title: title.trim() ? title.trim() : null,
      width: Number(width) as ViewBlock["width"],
      accent,
    }
    if (section) body.config = section.config
    update.mutate(body, { onSuccess: onClose })
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            Configure {TYPE_LABEL[block.block_type]}
          </SheetTitle>
          <SheetDescription>
            Title, size, and accent apply to every block type.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-4">
          {update.error && (
            <Alert variant="destructive">
              <AlertTitle>Save failed</AlertTitle>
              <AlertDescription>{update.error.detail}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="block-cfg-title">Title</Label>
            <Input
              id="block-cfg-title"
              maxLength={200}
              placeholder="Untitled block"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Width</Label>
            <div>
              <Segmented<WidthChoice>
                aria-label="Block width"
                value={width}
                onChange={setWidth}
                options={[
                  { value: "1", label: "1×" },
                  { value: "2", label: "2×" },
                  { value: "4", label: "Full" },
                ]}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Accent</Label>
            <div className="flex items-center gap-2">
              {ACCENTS.map((a) => (
                <button
                  key={a.value}
                  type="button"
                  aria-label={`Accent ${a.value}`}
                  aria-pressed={accent === a.value}
                  onClick={() => setAccent(a.value)}
                  className={`size-6 rounded-full ${a.swatch} ${
                    accent === a.value
                      ? "ring-2 ring-ring ring-offset-2 ring-offset-background"
                      : ""
                  }`}
                />
              ))}
            </div>
          </div>

          <Section
            key={block.id}
            initialConfig={block.config}
            onState={setSection}
          />

          <SheetFooter className="px-0">
            <p className="text-xs text-muted-foreground">
              Validated server-side on save.
              {section?.hint}
            </p>
            <Button type="button" onClick={onSave} disabled={saveDisabled}>
              {update.isPending ? "Saving…" : "Save"}
            </Button>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  )
}
