/**
 * ReviewSheet — right-flyout for reviewing a single form submission.
 *
 * Pending submissions (reviewer = editor):
 *   - All mapped fields rendered as EDITABLE inputs, seeded from submission.values.
 *   - COR number input (required, ^\S+$, ≤32 chars).
 *   - COR status select (default "submitted").
 *   - Target project display with override via TargetProjectPicker.
 *   - proposed_changes summary shown for context.
 *   - "Approve & push" button → POST .../approve with edited final_values.
 *   - "Reject" section: note input + confirm button → POST .../reject.
 *
 * Already-reviewed submissions: read-only outcome view.
 */
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/Badge"
import { useForm, useSubmission, useSubmissionApprove, useSubmissionReject } from "@/api/forms"
import { useProjectList } from "@/api/projects"
import { useEligibleAssignees } from "@/api/assignments"
import { ApiError } from "@/api/auth"
import { isNumericValid } from "@/pages/forms/formFieldMeta"
import { relativeTime } from "@/lib/relativeTime"
import { FieldInput } from "@/pages/forms/shared/FieldInput"
import { TargetProjectPicker } from "@/pages/forms/fill/TargetProjectPicker"
import { UserCombobox } from "@/components/UserCombobox"

// ── COR statuses ──────────────────────────────────────────────────────────────

const COR_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
]

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

// ── Main component ────────────────────────────────────────────────────────────

type Props = {
  formId: string
  sid: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ReviewSheet({ formId, sid, open, onOpenChange }: Props) {
  const formQuery = useForm(formId)
  const subQuery = useSubmission(formId, sid ?? undefined)
  const approveMutation = useSubmissionApprove(formId)
  const rejectMutation = useSubmissionReject(formId)

  const form = formQuery.data
  const sub = subQuery.data

  // Resolve the target project's label for display (same source as the
  // picker — TanStack dedupes the query, so no extra fetch).
  const { data: projData } = useProjectList({ page_size: 200 })
  const targetProject = projData?.items.find(
    (p) => p.id === sub?.target_project_id,
  )
  const targetProjectLabel = sub?.target_project_id
    ? targetProject
      ? `${targetProject.project_number} — ${targetProject.title}`
      : sub.target_project_id
    : null

  // Sort fields by order_index then created_at (mirrors FillForm).
  const sortedFields = form
    ? [...form.fields].sort(
        (a, b) =>
          a.order_index - b.order_index ||
          a.created_at.localeCompare(b.created_at),
      )
    : []

  // Controlled editable field values (string, seeded from submission values).
  const [values, setValues] = useState<Record<string, string>>({})

  // COR review fields
  const [corNumber, setCorNumber] = useState("")
  const [corStatus, setCorStatus] = useState("submitted")
  const [targetProjectId, setTargetProjectId] = useState<string | null>(null)

  // Assignment review: reviewer-chosen assignee (Pattern B, Phase 20.2).
  const [assigneeId, setAssigneeId] = useState<string | null>(null)

  // Milestone review: reviewer-chosen direction + date model (Pattern B, 20.3).
  const [msDirection, setMsDirection] = useState<string>("")
  const [msDateModel, setMsDateModel] = useState<string>("planned_actual")

  // Intake review: reviewer-entered project number (Phase 20.5).
  const [projectNumber, setProjectNumber] = useState<string>("")

  // Reject note state
  const [rejectNote, setRejectNote] = useState("")
  const [showRejectForm, setShowRejectForm] = useState(false)

  // Seed editable values whenever the submission data loads.
  useEffect(() => {
    if (!sub) return
    const seeded: Record<string, string> = {}
    for (const field of sortedFields) {
      const raw = sub.values[field.id]
      if (raw === undefined || raw === null) {
        seeded[field.id] = ""
      } else if (typeof raw === "boolean") {
        seeded[field.id] = raw ? "true" : "false"
      } else {
        seeded[field.id] = String(raw)
      }
    }
    setValues(seeded)
    setTargetProjectId(sub.target_project_id)
    setCorNumber("")
    setCorStatus("submitted")
    setAssigneeId(null)
    setMsDirection("")
    setMsDateModel("planned_actual")
    setProjectNumber("")
    setRejectNote("")
    setShowRejectForm(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub?.id, form?.id])

  function setValue(fieldId: string, v: string) {
    setValues((prev) => ({ ...prev, [fieldId]: v }))
  }

  // ── Numeric guard ─────────────────────────────────────────────────────────

  const numericErrors: Record<string, boolean> = {}
  for (const field of sortedFields) {
    const v = values[field.id] ?? ""
    if (!isNumericValid(field.field_type, v)) {
      numericErrors[field.id] = true
    }
  }
  const hasNumericErrors = Object.keys(numericErrors).length > 0

  // ── COR number validation ─────────────────────────────────────────────────

  const isCORForm = form?.target_entity === "cor"
  const isAssignmentForm = form?.target_entity === "assignment"
  const isMilestoneForm = form?.target_entity === "milestone"
  const isEventForm = form?.target_entity === "event"
  const isIntakeForm = form?.target_entity === "intake"
  const projectNumberValid =
    projectNumber.length >= 4 &&
    projectNumber.length <= 32 &&
    /^\S+$/.test(projectNumber)
  const corNumberValid =
    corNumber.length > 0 &&
    /^\S+$/.test(corNumber) &&
    corNumber.length <= 32

  // COR, assignment, and milestone forms all attach to an existing project.
  const requiresProject = isCORForm || isAssignmentForm || isMilestoneForm

  // Eligible assignees for the chosen project (assignment forms, Pattern B).
  const eligibleQuery = useEligibleAssignees(
    isAssignmentForm ? (targetProjectId ?? undefined) : undefined,
  )
  const eligibleAssignees = eligibleQuery.data?.items ?? []

  // COR forms need a COR number + project; assignment forms need project +
  // assignee; milestone forms need project + direction + date model; a
  // collect-only ("General") form needs none — it's just marked approved.
  const canApprove =
    !hasNumericErrors &&
    (isCORForm
      ? corNumberValid && targetProjectId !== null
      : isAssignmentForm
        ? targetProjectId !== null && assigneeId !== null
        : isMilestoneForm
          ? targetProjectId !== null && msDirection !== "" && msDateModel !== ""
          : isIntakeForm
            ? projectNumberValid
            : true)

  // ── Build final_values payload (coerce types) ─────────────────────────────

  function buildFinalValues(): Record<string, unknown> {
    const payload: Record<string, unknown> = {}
    for (const field of sortedFields) {
      const raw = values[field.id]
      if (raw === undefined || raw === "") continue
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
    return payload
  }

  // ── Approve handler ───────────────────────────────────────────────────────

  function handleApprove() {
    if (!sid) return
    approveMutation.mutate(
      {
        sid,
        final_values: buildFinalValues(),
        target_project_id: requiresProject ? targetProjectId : null,
        cor_number: isCORForm ? corNumber : null,
        cor_status: corStatus,
        assignee_user_id: isAssignmentForm ? assigneeId : null,
        milestone_direction: isMilestoneForm ? msDirection : null,
        milestone_date_model: isMilestoneForm ? msDateModel : null,
        intake_project_number: isIntakeForm ? projectNumber : null,
      },
      {
        onSuccess: () => {
          toast.success(
            isCORForm
              ? "Submission approved and COR created."
              : isAssignmentForm
                ? "Submission approved and assignment created."
                : isMilestoneForm
                  ? "Submission approved and milestone created."
                  : isEventForm
                    ? "Submission approved and event created."
                    : isIntakeForm
                      ? "Submission approved and project created."
                      : "Submission approved.",
          )
          onOpenChange(false)
        },
        onError: (err: ApiError) => {
          const msg =
            err.status === 409
              ? (err.detail ?? "That number already exists.")
              : err.status === 403
                ? `Permission denied: ${err.detail ?? "you cannot edit the target project"}`
                : err.status === 422
                  ? `Validation error: ${err.detail ?? "invalid field values"}`
                  : (err.detail ?? "Approve failed")
          toast.error(msg)
        },
      },
    )
  }

  // ── Reject handler ────────────────────────────────────────────────────────

  function handleReject() {
    if (!sid) return
    rejectMutation.mutate(
      { sid, review_note: rejectNote },
      {
        onSuccess: () => {
          toast.success("Submission rejected.")
          onOpenChange(false)
        },
        onError: (err: ApiError) => {
          toast.error(err.detail ?? "Reject failed")
        },
      },
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const isLoading = subQuery.isLoading || formQuery.isLoading
  const isPending = sub?.status === "pending"

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg overflow-y-auto"
      >
        {isLoading ? (
          <div className="p-4">
            <p className="text-sm text-muted-foreground">Loading…</p>
          </div>
        ) : subQuery.isError || !sub ? (
          <div className="p-4">
            <p className="text-sm text-destructive">Failed to load submission</p>
          </div>
        ) : (
          <>
            <SheetHeader className="pb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <SheetTitle className="text-base">Submission review</SheetTitle>
                <StatusBadge status={sub.status} />
              </div>
              <SheetDescription>
                Submitted by{" "}
                <span className="font-medium">
                  {sub.submitted_by_name ?? sub.submitted_by}
                </span>{" "}
                {relativeTime(sub.created_at)}
              </SheetDescription>
            </SheetHeader>

            <div className="px-4 pb-6 space-y-6">

              {/* ── Editable fields (pending) / Read-only values (reviewed) ── */}
              {sortedFields.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-sm font-medium">Field values</h3>
                  <div className="grid grid-cols-1 gap-3">
                    {sortedFields.map((field) => (
                      <div key={field.id} className="space-y-1.5">
                        <Label htmlFor={`review-${field.id}`} className="text-sm">
                          {field.label || "Untitled field"}
                          {field.required && (
                            <span className="text-destructive ml-1" title="Required">*</span>
                          )}
                        </Label>
                        {isPending ? (
                          <FieldInput
                            field={field}
                            value={values[field.id] ?? ""}
                            onChange={(v) => setValue(field.id, v)}
                            numericError={numericErrors[field.id]}
                            idPrefix="review-"
                            applyRequired={false}
                          />
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            {(() => {
                              const raw = sub.values[field.id]
                              if (raw === undefined || raw === null) return "—"
                              if (typeof raw === "boolean") return raw ? "Yes" : "No"
                              return String(raw)
                            })()}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Proposed changes summary ── */}
              {sub.proposed_changes && sub.proposed_changes.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Proposed writes</h3>
                  <ul className="rounded-md border bg-muted/30 divide-y text-xs">
                    {sub.proposed_changes.map((pc, i) => (
                      <li key={i} className="px-3 py-2 flex gap-2">
                        <span className="font-mono text-muted-foreground shrink-0">
                          {pc.group} / {pc.target}
                        </span>
                        <span className="ml-auto font-medium">
                          {String(pc.value)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* ── Target project (pending project-bound forms: COR / assignment) ── */}
              {isPending && requiresProject && (
                <div className="space-y-1.5">
                  <Label className="text-sm">
                    Target project
                    <span className="text-destructive ml-1" title="Required">*</span>
                  </Label>
                  <TargetProjectPicker
                    value={targetProjectId}
                    onChange={(v) => {
                      setTargetProjectId(v)
                      // Eligible assignees depend on the project — clear the
                      // previous pick when the project changes.
                      setAssigneeId(null)
                    }}
                  />
                </div>
              )}

              {/* ── Assignee (pending assignment forms only, Pattern B) ── */}
              {isPending && isAssignmentForm && (
                <div className="space-y-1.5">
                  <Label className="text-sm">
                    Assignee{" "}
                    <span className="text-destructive" title="Required">*</span>
                  </Label>
                  {/* Searchable combobox — depts can have many users (#21.7). */}
                  <UserCombobox
                    users={eligibleAssignees}
                    value={assigneeId ?? ""}
                    onChange={(id) => setAssigneeId(id)}
                    isLoading={!targetProjectId || eligibleQuery.isLoading}
                    placeholder={
                      !targetProjectId
                        ? "Pick a project first…"
                        : "Select an assignee…"
                    }
                  />
                  {targetProjectId &&
                    !eligibleQuery.isLoading &&
                    eligibleAssignees.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        No eligible assignees for this project.
                      </p>
                    )}
                </div>
              )}

              {/* ── Milestone direction + date model (pending milestone forms) ── */}
              {isPending && isMilestoneForm && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="ms-direction" className="text-sm">
                      Direction{" "}
                      <span className="text-destructive" title="Required">*</span>
                    </Label>
                    <Select value={msDirection} onValueChange={setMsDirection}>
                      <SelectTrigger id="ms-direction" aria-label="Direction">
                        <SelectValue placeholder="Select…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="outbound">Outbound</SelectItem>
                        <SelectItem value="inbound">Inbound</SelectItem>
                        <SelectItem value="internal">Internal</SelectItem>
                        <SelectItem value="external">External</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ms-datemodel" className="text-sm">
                      Date model{" "}
                      <span className="text-destructive" title="Required">*</span>
                    </Label>
                    <Select value={msDateModel} onValueChange={setMsDateModel}>
                      <SelectTrigger id="ms-datemodel" aria-label="Date model">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="planned_actual">Planned &amp; actual</SelectItem>
                        <SelectItem value="single">Single date</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* ── COR number + status (pending COR forms only) ── */}
              {isPending && isCORForm && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="cor-number" className="text-sm">
                      COR number{" "}
                      <span className="text-destructive" title="Required">*</span>
                    </Label>
                    <Input
                      id="cor-number"
                      type="text"
                      value={corNumber}
                      onChange={(e) => setCorNumber(e.target.value)}
                      placeholder="e.g. COR-001"
                      maxLength={32}
                      aria-label="COR number"
                    />
                    {corNumber.length > 0 && !corNumberValid && (
                      <p className="text-xs text-destructive">
                        Required, no spaces, max 32 chars
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="cor-status" className="text-sm">
                      COR status
                    </Label>
                    <Select value={corStatus} onValueChange={setCorStatus}>
                      <SelectTrigger id="cor-status" aria-label="COR status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COR_STATUSES.map(({ value, label }) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* ── Project number (pending intake forms only, Phase 20.5) ── */}
              {isPending && isIntakeForm && (
                <div className="space-y-1.5">
                  <Label htmlFor="intake-number" className="text-sm">
                    Project number{" "}
                    <span className="text-destructive" title="Required">*</span>
                  </Label>
                  <Input
                    id="intake-number"
                    type="text"
                    value={projectNumber}
                    onChange={(e) => setProjectNumber(e.target.value)}
                    placeholder="e.g. PRJ-2026-001"
                    maxLength={32}
                    aria-label="Project number"
                  />
                  {projectNumber.length > 0 && !projectNumberValid && (
                    <p className="text-xs text-destructive">
                      4–32 characters, no spaces
                    </p>
                  )}
                </div>
              )}

              {/* ── Actions (pending only) ── */}
              {isPending && (
                <div className="space-y-4 pt-2 border-t">
                  {/* Approve */}
                  <Button
                    type="button"
                    className="w-full"
                    disabled={!canApprove || approveMutation.isPending}
                    onClick={handleApprove}
                    aria-label={
                      isCORForm || isAssignmentForm || isMilestoneForm || isEventForm || isIntakeForm
                        ? "Approve & push"
                        : "Approve"
                    }
                  >
                    {approveMutation.isPending
                      ? "Approving…"
                      : isCORForm
                        ? "Approve & push"
                        : isAssignmentForm || isMilestoneForm || isEventForm || isIntakeForm
                          ? "Approve & create"
                          : "Approve"}
                  </Button>

                  {/* Reject section */}
                  {!showRejectForm ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full text-destructive border-destructive hover:bg-destructive/10"
                      onClick={() => setShowRejectForm(true)}
                    >
                      Reject…
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="reject-note" className="text-sm">
                        Rejection note
                      </Label>
                      <Textarea
                        id="reject-note"
                        rows={3}
                        value={rejectNote}
                        onChange={(e) => setRejectNote(e.target.value)}
                        placeholder="Explain why this submission is being rejected…"
                        aria-label="Rejection note"
                      />
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="destructive"
                          className="flex-1"
                          disabled={rejectMutation.isPending}
                          onClick={handleReject}
                          aria-label="Confirm reject"
                        >
                          {rejectMutation.isPending ? "Rejecting…" : "Confirm reject"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setShowRejectForm(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Read-only outcome (approved/rejected) ── */}
              {!isPending && (
                <div className="space-y-2 pt-2 border-t">
                  <h3 className="text-sm font-medium">Review outcome</h3>
                  <dl className="space-y-1 text-sm">
                    {targetProjectLabel && (
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground w-28 shrink-0">Target project</dt>
                        <dd>{targetProjectLabel}</dd>
                      </div>
                    )}
                    {sub.reviewed_by && (
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground w-28 shrink-0">Reviewed by</dt>
                        <dd>{sub.reviewed_by_name ?? sub.reviewed_by}</dd>
                      </div>
                    )}
                    {sub.reviewed_at && (
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground w-28 shrink-0">Reviewed at</dt>
                        <dd>{relativeTime(sub.reviewed_at)}</dd>
                      </div>
                    )}
                    {sub.review_note && (
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground w-28 shrink-0">Note</dt>
                        <dd>{sub.review_note}</dd>
                      </div>
                    )}
                    {sub.pushed_entity_type && sub.pushed_entity_id && (
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground w-28 shrink-0">Created</dt>
                        <dd className="font-mono text-xs">
                          {sub.pushed_entity_type} {sub.pushed_entity_id}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}

            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
