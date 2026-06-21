/**
 * FormPreview — read-only render of the form's current fields.
 * Shown in the right pane of the build split layout.
 * Uses shadcn primitives to mirror how the actual Fill out mode will look.
 */
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import type { FormField } from "@/api/forms"

// ── Single field preview input (disabled/read-only) ───────────────────────────

function FieldPreviewInput({ field }: { field: FormField }) {
  const ft = field.field_type

  if (ft === "long_text") {
    return (
      <Textarea
        rows={3}
        disabled
        placeholder={field.placeholder ?? ""}
        className="opacity-60"
      />
    )
  }

  if (ft === "single_select") {
    const choices = field.options?.choices ?? []
    return (
      <Select disabled>
        <SelectTrigger className="opacity-60" aria-label={field.label}>
          <SelectValue
            placeholder={field.placeholder ?? "Select…"}
          />
        </SelectTrigger>
        <SelectContent>
          {choices.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  if (ft === "boolean") {
    return (
      <div className="flex items-center gap-2 opacity-60">
        <Switch disabled />
        <span className="text-sm text-muted-foreground">Yes / No</span>
      </div>
    )
  }

  if (ft === "currency") {
    return (
      <div className="relative opacity-60">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          $
        </span>
        <Input
          type="text"
          disabled
          placeholder="0.00"
          className="pl-7"
        />
      </div>
    )
  }

  if (ft === "date") {
    return (
      <Input
        type="date"
        disabled
        className="opacity-60"
      />
    )
  }

  if (ft === "integer" || ft === "decimal") {
    return (
      <Input
        type="number"
        disabled
        placeholder={field.placeholder ?? ""}
        className="opacity-60"
      />
    )
  }

  // short_text and fallback
  return (
    <Input
      type="text"
      disabled
      placeholder={field.placeholder ?? ""}
      className="opacity-60"
    />
  )
}

// ── Preview panel ─────────────────────────────────────────────────────────────

type Props = {
  name: string
  description: string | null
  fields: FormField[]
}

export function FormPreview({ name, description, fields }: Props) {
  const sorted = [...fields].sort(
    (a, b) =>
      a.order_index - b.order_index ||
      a.created_at.localeCompare(b.created_at),
  )

  return (
    <div className="rounded-lg border bg-card p-5 shadow-sm space-y-5">
      {/* Badge */}
      <span className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
        Live preview
      </span>

      {/* Form header */}
      <div className="space-y-1">
        <h2 className="text-base font-semibold">
          {name || "Untitled form"}
        </h2>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>

      {/* Fields */}
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No fields yet — add one from the palette.
        </p>
      ) : (
        // 2-column form grid (mirrors the mockup): compact fields take one
        // column; long-text fields span the full width.
        <div className="grid grid-cols-2 gap-4">
          {sorted.map((field) => (
            <div
              key={field.id}
              className={
                "space-y-1.5 " +
                (field.field_type === "long_text" ? "col-span-2" : "")
              }
            >
              <Label className="flex items-center gap-1">
                {field.label || "Untitled field"}
                {field.required && (
                  <span className="text-destructive" title="Required">
                    *
                  </span>
                )}
              </Label>
              <FieldPreviewInput field={field} />
              {field.help_text && (
                <p className="text-xs text-muted-foreground">
                  {field.help_text}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Disabled submit */}
      {sorted.length > 0 && (
        <div className="pt-2">
          <button
            disabled
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground opacity-40 cursor-not-allowed"
          >
            Submit
          </button>
        </div>
      )}
    </div>
  )
}
