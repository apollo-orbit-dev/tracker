/**
 * Shared controlled per-field input for the Forms fill-out form and the
 * review flyout. Previously duplicated in FillForm + ReviewSheet with only an
 * id prefix and the `required` attribute differing (Phase 18.5 DRY).
 */
import { Input } from "@/components/ui/input"
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

type Props = {
  field: FormField
  value: string
  onChange: (v: string) => void
  numericError?: boolean
  /** Prefix for the input id so fill-out + review ids don't collide (e.g. "review-"). */
  idPrefix?: string
  /** Whether to set the HTML `required` attribute (fill-out: yes; review: no). */
  applyRequired?: boolean
}

export function FieldInput({
  field,
  value,
  onChange,
  numericError,
  idPrefix = "",
  applyRequired = true,
}: Props) {
  const ft = field.field_type
  const id = `${idPrefix}${field.id}`
  const required = applyRequired && field.required

  if (ft === "long_text") {
    return (
      <Textarea
        id={id}
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder ?? ""}
        required={required}
      />
    )
  }

  if (ft === "single_select") {
    const choices = field.options?.choices ?? []
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} aria-label={field.label}>
          <SelectValue placeholder={field.placeholder ?? "Select…"} />
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
      <div className="flex items-center gap-2">
        <Switch
          id={id}
          checked={value === "true"}
          onCheckedChange={(checked) => onChange(checked ? "true" : "false")}
        />
        <span className="text-sm text-muted-foreground">
          {value === "true" ? "Yes" : "No"}
        </span>
      </div>
    )
  }

  if (ft === "currency") {
    return (
      <>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
            $
          </span>
          <Input
            id={id}
            type="text"
            inputMode="decimal"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="0.00"
            className="pl-7"
            required={required}
            aria-invalid={numericError}
          />
        </div>
        {numericError && (
          <p className="text-xs text-destructive">Enter a valid number</p>
        )}
      </>
    )
  }

  if (ft === "date") {
    return (
      <Input
        id={id}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      />
    )
  }

  if (ft === "integer" || ft === "decimal") {
    return (
      <>
        <Input
          id={id}
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? ""}
          required={required}
          aria-invalid={numericError}
        />
        {numericError && (
          <p className="text-xs text-destructive">Enter a valid number</p>
        )}
      </>
    )
  }

  // short_text and fallback
  return (
    <Input
      id={id}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder ?? ""}
      required={required}
    />
  )
}
