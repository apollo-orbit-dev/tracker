/**
 * FormPage — detail/editor page for a single form.
 *
 * Modes:
 *   Build      — split builder (field list + live preview). Gated by project_editor+.
 *   Fill out   — fill-out mode for submitting responses.
 *   Responses  — responses list + review/approval.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router"
import { Archive, Inbox, MoreHorizontal, PencilRuler, PenLine, Trash2, Undo2 } from "lucide-react"
import { toast } from "sonner"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/Badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ApiError } from "@/api/auth"
import { useAuth } from "@/hooks/useAuth"
import { useTopbarCrumbs } from "@/hooks/useTopbarCrumbs"
import { hasRole } from "@/lib/roles"
import {
  useForm,
  useFormDelete,
  useFormUpdate,
  useSubmissionList,
} from "@/api/forms"
import { FormMeta } from "@/pages/forms/builder/FormMeta"
import { FieldPalette } from "@/pages/forms/builder/FieldPalette"
import { FieldList } from "@/pages/forms/builder/FieldList"
import { FieldConfigSheet } from "@/pages/forms/builder/FieldConfigSheet"
import { FormPreview } from "@/pages/forms/builder/FormPreview"
import { WiringSummary } from "@/pages/forms/builder/WiringSummary"
import { FillForm } from "@/pages/forms/fill/FillForm"
import { ResponsesTable } from "@/pages/forms/responses/ResponsesTable"

// ── Build mode split layout ───────────────────────────────────────────────────

function BuildMode({ formId }: { formId: string }) {
  const formQuery = useForm(formId)
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null)

  if (formQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }
  if (formQuery.isError) {
    return (
      <p className="text-sm text-destructive">
        {formQuery.error.detail ?? "Failed to load form"}
      </p>
    )
  }

  const form = formQuery.data!
  const selectedField =
    form.fields.find((f) => f.id === selectedFieldId) ?? null
  // Published forms lock their structure (#1). Editors unpublish to edit.
  const readOnly = form.status === "active"

  return (
    <>
      {readOnly && (
        <div className="mb-4 rounded-md border border-[hsl(var(--tone-emerald-dot))] bg-[hsl(var(--tone-emerald-bg))] px-3 py-2 text-sm text-[hsl(var(--tone-emerald-fg))]">
          This form is <b>published</b>, so its structure is locked. Use the status
          menu above to <b>unpublish (move to draft)</b> before editing fields or
          the purpose.
        </div>
      )}
      <WiringSummary form={form} />
      <div className="grid grid-cols-1 lg:grid-cols-[440px_1fr] gap-6 items-start">
        {/* Left pane: meta + field list + palette */}
        <div className="rounded-lg border bg-card p-5 space-y-5">
          <FormMeta form={form} readOnly={readOnly} />

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Fields</span>
              <span className="inline-flex items-center justify-center rounded-full bg-[hsl(var(--muted))] text-[hsl(var(--muted-fg))] text-[11px] font-medium min-w-[18px] h-[18px] px-1.5">
                {form.fields.length}
              </span>
            </div>
            <FieldList
              form={form}
              selectedFieldId={selectedFieldId}
              onSelectField={(id) =>
                setSelectedFieldId((prev) => (prev === id ? null : id))
              }
              readOnly={readOnly}
            />
          </div>

          {!readOnly && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Add field
              </p>
              <FieldPalette
                formId={formId}
                onCreated={(id) => setSelectedFieldId(id)}
              />
            </div>
          )}
        </div>

        {/* Right pane: live preview */}
        <div className="sticky top-6">
          <FormPreview
            name={form.name}
            description={form.description}
            fields={form.fields}
          />
        </div>

        {/* Field config sheet (right flyout). Keyed by the selected field so it
            remounts (re-seeds its inputs + dropdown options) per field (#3). */}
        <FieldConfigSheet
          key={selectedFieldId ?? "none"}
          formId={formId}
          field={selectedField}
          targetEntity={form.target_entity}
          targetTemplateId={form.target_template_id}
          open={selectedFieldId !== null}
          onOpenChange={(open) => {
            if (!open) setSelectedFieldId(null)
          }}
          onDeleted={() => setSelectedFieldId(null)}
        />
      </div>
    </>
  )
}

// ── Responses tab trigger with optional pending count chip ────────────────────

function ResponsesTrigger({ formId }: { formId: string }) {
  const submissions = useSubmissionList(formId, "pending")
  const pending = submissions.data?.total ?? 0

  return (
    <TabsTrigger value="responses" className="gap-1.5">
      <Inbox size={14} />
      Responses
      {pending > 0 && (
        <span className="inline-flex items-center justify-center rounded-full bg-[hsl(var(--tone-amber-bg))] text-[hsl(var(--tone-amber-fg))] text-[10px] font-semibold min-w-[16px] h-[16px] px-1">
          {pending}
        </span>
      )}
    </TabsTrigger>
  )
}

// ── Page shell ────────────────────────────────────────────────────────────────

export function FormPage() {
  // Route is `/forms/:fid` (App.tsx) — the param name must match.
  const { fid: id } = useParams<{ fid: string }>()
  const { data: user } = useAuth()
  const formQuery = useForm(id)

  const formName = formQuery.data?.name ?? "Form"
  useTopbarCrumbs(
    useMemo(
      () => [{ label: "Forms", to: "/forms" }, { label: formName }],
      [formName],
    ),
  )

  const canBuild = !!user && hasRole(user.roles, "project_editor")
  const updateForm = useFormUpdate(id ?? "")
  const deleteForm = useFormDelete()
  const navigate = useNavigate()
  const [deleteOpen, setDeleteOpen] = useState(false)

  // Default tab depends on role + status: editors land on Build for drafts
  // and Fill for published forms; viewers always Fill. Re-seed every time we
  // land on a *different* form (the route id changes without remounting this
  // page), so navigating draft→published always re-applies the correct
  // default. A manual tab switch only sticks within the form it was made on.
  const [tab, setTab] = useState<"build" | "fill" | "responses">(
    canBuild ? "build" : "fill",
  )
  const lastSeededId = useRef<string | null>(null)
  useEffect(() => {
    const data = formQuery.data
    if (!data) return
    if (lastSeededId.current === data.id) return
    lastSeededId.current = data.id
    if (!canBuild) {
      setTab("fill")
    } else {
      setTab(data.status === "active" ? "fill" : "build")
    }
  }, [formQuery.data, canBuild])

  if (!id) {
    return <p className="text-sm text-destructive">No form ID in URL.</p>
  }

  const status = formQuery.data?.status ?? "draft"
  const isActive = status === "active"
  const targetEntity = formQuery.data?.target_entity ?? null
  const PURPOSE_BADGE: Record<string, { tone: "amber" | "blue" | "emerald" | "indigo" | "rose"; label: string }> = {
    cor: { tone: "amber", label: "Change order" },
    assignment: { tone: "blue", label: "Assignment" },
    milestone: { tone: "emerald", label: "Milestone" },
    event: { tone: "indigo", label: "Event" },
    intake: { tone: "rose", label: "Project intake" },
  }
  const purposeMeta = targetEntity ? PURPOSE_BADGE[targetEntity] : undefined
  const purposeBadge = purposeMeta ? (
    <Badge tone={purposeMeta.tone}>{purposeMeta.label}</Badge>
  ) : (
    <Badge tone="slate">General</Badge>
  )
  const statusBadge = (
    <Badge tone={isActive ? "emerald" : status === "draft" ? "amber" : "slate"} dot>
      {status === "active" ? "Active" : status === "draft" ? "Draft" : "Archived"}
    </Badge>
  )

  // A form only accepts submissions when active. Editors flip the status here;
  // without this control a form is stuck in draft and submit returns 422.
  const setStatus = (next: "draft" | "active" | "archived", msg: string) =>
    updateForm.mutate(
      { status: next },
      {
        onSuccess: () => toast.success(msg),
        onError: (e) =>
          toast.error(e instanceof ApiError ? e.detail : "Update failed"),
      },
    )

  const confirmDelete = () => {
    if (!id) return
    deleteForm.mutate(id, {
      onSuccess: () => {
        toast.success("Form deleted")
        setDeleteOpen(false)
        navigate("/forms")
      },
      onError: (e) =>
        toast.error(e instanceof ApiError ? e.detail : "Delete failed"),
    })
  }

  // Primary action (Activate) stays inline; secondary/destructive actions
  // (Unpublish / Archive / Delete) live in a kebab per the app's convention
  // of hiding low-frequency actions behind a menu.
  const statusControl = canBuild ? (
    <span className="flex items-center gap-1.5">
      {statusBadge}
      {status !== "active" && (
        <Button
          size="sm"
          className="h-7"
          disabled={updateForm.isPending}
          onClick={() => setStatus("active", "Form activated — now accepting submissions")}
        >
          {status === "archived" ? "Reactivate" : "Activate"}
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label="Form actions"
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {status === "active" && (
            <>
              <DropdownMenuItem
                onClick={() => setStatus("draft", "Form moved to draft")}
              >
                <Undo2 className="size-3.5" />
                Unpublish (move to draft)
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setStatus("archived", "Form archived")}
              >
                <Archive className="size-3.5" />
                Archive
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem
            onSelect={() => setDeleteOpen(true)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="size-3.5" />
            Delete form
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  ) : (
    statusBadge
  )

  return (
    <main className="space-y-5 px-6 py-7">
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        {/* Page head row */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold tracking-tight">
              {formQuery.data?.name ?? "Form"}
            </h1>
            {formQuery.data && purposeBadge}
            {formQuery.data && statusControl}
          </div>
          <TabsList className="shrink-0">
            {canBuild && (
              <TabsTrigger value="build" className="gap-1.5">
                <PencilRuler size={14} />
                Build
              </TabsTrigger>
            )}
            <TabsTrigger value="fill" className="gap-1.5">
              <PenLine size={14} />
              Fill out
            </TabsTrigger>
            <ResponsesTrigger formId={id} />
          </TabsList>
        </div>

        {canBuild && (
          <TabsContent value="build" className="mt-0">
            {/* key by formId so the builder remounts (and FormMeta re-seeds its
                Purpose/name state) when navigating between forms (#2, Phase 21). */}
            <BuildMode key={id} formId={id} />
          </TabsContent>
        )}

        <TabsContent value="fill" className="mt-0">
          {formQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : formQuery.isError ? (
            <p className="text-sm text-destructive">
              {formQuery.error.detail ?? "Failed to load form"}
            </p>
          ) : formQuery.data ? (
            <>
              {!isActive && (
                <div className="mb-4 rounded-md border border-[hsl(var(--tone-amber-dot))] bg-[hsl(var(--tone-amber-bg))] px-3 py-2 text-sm text-[hsl(var(--tone-amber-fg))]">
                  This form is <b>{status}</b> and won't accept submissions yet.
                  {canBuild
                    ? " Click Activate above to make it fillable."
                    : ""}
                </div>
              )}
              <FillForm form={formQuery.data} />
            </>
          ) : null}
        </TabsContent>

        <TabsContent value="responses" className="mt-0">
          <ResponsesTable formId={id} />
        </TabsContent>
      </Tabs>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete form?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete{" "}
              <span className="font-medium">
                {formQuery.data?.name ?? "this form"}
              </span>{" "}
              and remove it and its submissions from view? This can't be undone
              from the UI.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteForm.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteForm.isPending}
              onClick={(e) => {
                e.preventDefault()
                confirmDelete()
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteForm.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}
