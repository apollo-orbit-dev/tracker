/**
 * FillForm — live editable rendering of a form's fields for submission.
 *
 * Field type → input mapping:
 *   text / short_text → Input (type="text")
 *   long_text         → Textarea  (col-span-2)
 *   integer / decimal → Input (type="number")
 *   currency          → Input with "$" prefix (type="text")
 *   date              → Input (type="date")
 *   single_select     → Select (shadcn)
 *   boolean           → Switch
 *
 * Layout: 2-column grid; long_text fields span both columns.
 *
 * Required guard: Submit disabled until every required live field has a
 * non-empty value AND (if form.target_entity === "cor") a project is chosen.
 *
 * Numeric guard: Submit disabled if any non-empty numeric field (currency,
 * decimal, integer) has an invalid value (e.g. "abc" in a currency field).
 * An inline error is shown under the offending field.
 *
 * On success: shows a "Submitted — pending review" message with a
 * "Submit another" reset button.
 */
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import type { Form } from "@/api/forms"
import { useFormTargets, useFormUserOptions, useSubmit } from "@/api/forms"
import { isNumericValid } from "@/pages/forms/formFieldMeta"
import { FieldInput } from "@/pages/forms/shared/FieldInput"
import { TargetProjectPicker } from "./TargetProjectPicker"

// ── Main component ────────────────────────────────────────────────────────────

type Props = {
  form: Form
}

export function FillForm({ form }: Props) {
  // Controlled field values keyed by field id.
  const [values, setValues] = useState<Record<string, string>>({})
  const [targetProjectId, setTargetProjectId] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const submitMutation = useSubmit(form.id)
  const { data: formTargets } = useFormTargets()

  // Sort fields by order_index then created_at (mirrors FormPreview).
  const sorted = [...form.fields].sort(
    (a, b) =>
      a.order_index - b.order_index ||
      a.created_at.localeCompare(b.created_at),
  )

  // Only live fields are shown/submitted (skip any that are "draft" etc.
  // if the Form type ever adds a status per field — for now all are live).
  const liveFields = sorted

  // Dept-scoped user list for any user-picker field (Phase 27.9); only
  // fetched when the form actually has one.
  const hasUserField = liveFields.some((f) => f.field_type === "user")
  const { data: userOpts } = useFormUserOptions(form.id, hasUserField)

  // Whether this target attaches to an existing project (cor / assignment /
  // milestone) — derived from the targets registry, not hardcoded. Intake/event
  // and collect-only forms don't need one.
  const requiresProject = !!(
    form.target_entity && formTargets?.targets[form.target_entity]?.requires_project
  )

  const allRequiredFilled = liveFields
    .filter((f) => f.required)
    .every((f) => {
      const v = values[f.id] ?? ""
      return v.trim() !== ""
    })

  // Numeric guard: any non-empty numeric field must have a valid value.
  const numericErrors: Record<string, boolean> = {}
  for (const field of liveFields) {
    const v = values[field.id] ?? ""
    if (!isNumericValid(field.field_type, v)) {
      numericErrors[field.id] = true
    }
  }
  const hasNumericErrors = Object.keys(numericErrors).length > 0

  const canSubmit =
    allRequiredFilled &&
    !hasNumericErrors &&
    (!requiresProject || targetProjectId !== null)

  function setValue(fieldId: string, v: string) {
    setValues((prev) => ({ ...prev, [fieldId]: v }))
  }

  function reset() {
    setValues({})
    setTargetProjectId(null)
    setSubmitted(false)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    // Build the payload: only include fields that have a value.
    const payload: Record<string, unknown> = {}
    for (const field of liveFields) {
      const raw = values[field.id]
      if (raw === undefined || raw === "") continue

      // Coerce numeric types so the backend receives numbers.
      if (field.field_type === "integer") {
        const n = parseInt(raw, 10)
        if (!isNaN(n)) payload[field.id] = n
      } else if (field.field_type === "decimal" || field.field_type === "currency") {
        const n = parseFloat(raw)
        if (!isNaN(n)) payload[field.id] = n
      } else if (field.field_type === "boolean") {
        payload[field.id] = raw === "true"
      } else {
        payload[field.id] = raw
      }
    }

    submitMutation.mutate(
      { values: payload, target_project_id: targetProjectId },
      {
        onSuccess: () => {
          setSubmitted(true)
        },
        onError: (err) => {
          toast.error(err.detail ?? "Submission failed")
        },
      },
    )
  }

  // ── Success state ─────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div className="rounded-lg border bg-card p-6 space-y-4 max-w-2xl shadow-sm">
        <div className="space-y-1">
          <p className="font-semibold text-base">Submitted — pending review</p>
          <p className="text-sm text-muted-foreground">
            Your response has been submitted and is awaiting review.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={reset}>
          Submit another
        </Button>
      </div>
    )
  }

  // ── Form ──────────────────────────────────────────────────────────────────

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 max-w-2xl rounded-lg border bg-card p-6 shadow-sm"
    >
      {/* The form name is already shown in the page header — only the
          optional description is rendered here (when present). */}
      {form.description && (
        <p className="text-sm text-muted-foreground">{form.description}</p>
      )}

      {/* Target project picker (project-bound forms: cor / assignment / milestone) */}
      {requiresProject && (
        <div className="space-y-1.5">
          <Label>
            Target project{" "}
            <span className="text-destructive" title="Required">
              *
            </span>
          </Label>
          <TargetProjectPicker
            value={targetProjectId}
            onChange={setTargetProjectId}
          />
          <p className="text-xs text-muted-foreground">
            The project this submission will be linked to.
          </p>
        </div>
      )}

      {/* Fields grid */}
      {liveFields.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          This form has no fields yet.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {liveFields.map((field) => (
            <div
              key={field.id}
              className={
                "space-y-1.5 " +
                (field.field_type === "long_text" ? "col-span-2" : "")
              }
            >
              <Label htmlFor={field.id} className="flex items-center gap-1">
                {field.label || "Untitled field"}
                {field.required && (
                  <span className="text-destructive" title="Required">
                    *
                  </span>
                )}
              </Label>
              <FieldInput
                field={field}
                value={values[field.id] ?? ""}
                onChange={(v) => setValue(field.id, v)}
                numericError={numericErrors[field.id]}
                userOptions={userOpts?.items ?? []}
              />
              {field.help_text && (
                <p className="text-xs text-muted-foreground">
                  {field.help_text}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Submit */}
      <div className="pt-2">
        <Button
          type="submit"
          disabled={!canSubmit || submitMutation.isPending}
        >
          {submitMutation.isPending ? "Submitting…" : "Submit"}
        </Button>
      </div>
    </form>
  )
}
