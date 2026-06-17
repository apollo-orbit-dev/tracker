// Phase 7.10 — text block config section (split out of
// BlockConfigSheet; controls and behavior unchanged from 7.4).
import { useEffect, useState } from "react"

import { Segmented } from "@/components/Segmented"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import type { SectionProps } from "./shared"

type SizePreset = "heading" | "body" | "caption"

export function TextConfigSection({ initialConfig, onState }: SectionProps) {
  const cfg = (initialConfig ?? {}) as { md?: unknown; size_preset?: unknown }
  const [md, setMd] = useState(typeof cfg.md === "string" ? cfg.md : "")
  const [sizePreset, setSizePreset] = useState<SizePreset>(
    cfg.size_preset === "heading" || cfg.size_preset === "caption"
      ? cfg.size_preset
      : "body",
  )

  useEffect(() => {
    onState({ config: { md, size_preset: sizePreset }, valid: true, hint: "" })
    // onState is referentially stable (a setState in the shell).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [md, sizePreset])

  return (
    <>
      <div className="space-y-1.5">
        <Label>Text size</Label>
        <div>
          <Segmented<SizePreset>
            aria-label="Text size preset"
            value={sizePreset}
            onChange={setSizePreset}
            options={[
              { value: "heading", label: "Heading" },
              { value: "body", label: "Body" },
              { value: "caption", label: "Caption" },
            ]}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="block-cfg-md">Content</Label>
        <Textarea
          id="block-cfg-md"
          rows={8}
          maxLength={5000}
          value={md}
          onChange={(e) => setMd(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Markdown supported: **bold**, _italic_, # headings, - lists,
          [links](url), `code`, &gt; quotes. Max 5000 characters.
        </p>
      </div>
    </>
  )
}
