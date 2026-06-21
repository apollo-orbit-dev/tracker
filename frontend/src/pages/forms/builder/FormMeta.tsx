/**
 * FormMeta — editable name, description, and target entity for a form.
 * Sits at the top of the Build panel's left pane.
 */
import { useState } from "react"
import { CalendarDays, CircleCheck, ClipboardList, FileSignature, Flag, FolderPlus, Inbox } from "lucide-react"
import { toast } from "sonner"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useFormUpdate, type Form } from "@/api/forms"
import { useTemplateList } from "@/api/templates"

type Accent = "slate" | "amber" | "blue" | "emerald" | "indigo" | "rose"

type PurposeCard = {
  value: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  accent: Accent
  name: string
  desc: string
}

const PURPOSE_CARDS: PurposeCard[] = [
  {
    value: "none",
    icon: Inbox,
    accent: "slate",
    name: "General",
    desc: "Collected only — nothing is written on submit",
  },
  {
    value: "cor",
    icon: FileSignature,
    accent: "amber",
    name: "Change order",
    desc: "Logs a COR against a project",
  },
  {
    value: "assignment",
    icon: ClipboardList,
    accent: "blue",
    name: "Assignment",
    desc: "Creates a task on a project (you pick the assignee on approval)",
  },
  {
    value: "milestone",
    icon: Flag,
    accent: "emerald",
    name: "Milestone",
    desc: "Adds a milestone to a project (you set direction + dates on approval)",
  },
  {
    value: "event",
    icon: CalendarDays,
    accent: "indigo",
    name: "Event",
    desc: "Adds a calendar event to this form's department",
  },
  {
    value: "intake",
    icon: FolderPlus,
    accent: "rose",
    name: "Project intake",
    desc: "Creates a new project under a chosen template (number set on approval)",
  },
]

type Props = {
  form: Form
  /** Published forms lock their structure (target, template, fields). */
  readOnly?: boolean
}

export function FormMeta({ form, readOnly = false }: Props) {
  const update = useFormUpdate(form.id)

  // Templates available to bind an intake form to (same department as the form).
  const templates = useTemplateList()
  const deptTemplates = (templates.data?.items ?? []).filter(
    (t) => t.department_id === form.department_id,
  )

  function handleTemplateChange(value: string) {
    update.mutate(
      { target_template_id: value },
      {
        onError: (err) =>
          toast.error(err.detail ?? "Failed to bind template"),
      },
    )
  }

  const [name, setName] = useState(form.name)
  const [description, setDescription] = useState(form.description ?? "")
  const [targetEntity, setTargetEntity] = useState<string>(
    form.target_entity ?? "none",
  )

  function commitName() {
    const trimmed = name.trim()
    if (!trimmed || trimmed === form.name) return
    update.mutate(
      { name: trimmed },
      { onError: (err) => toast.error(err.detail ?? "Failed to save name") },
    )
  }

  function commitDescription() {
    const trimmed = description.trim() || null
    if (trimmed === (form.description ?? null)) return
    update.mutate(
      { description: trimmed },
      {
        onError: (err) =>
          toast.error(err.detail ?? "Failed to save description"),
      },
    )
  }

  function handleTargetChange(value: string) {
    setTargetEntity(value)
    const entity = value === "none" ? null : value
    if (entity === (form.target_entity ?? null)) return
    update.mutate(
      { target_entity: entity },
      {
        onError: (err) =>
          toast.error(err.detail ?? "Failed to save target entity"),
      },
    )
  }

  return (
    <div className="space-y-4 pb-4">
      <div className="space-y-1.5">
        <Label htmlFor="fb-name">Form name</Label>
        <Input
          id="fb-name"
          value={name}
          maxLength={200}
          placeholder="Name this form…"
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur()
          }}
        />
      </div>

      <div className="space-y-1.5">
        <Label>
          Purpose{" "}
          <span className="text-xs text-muted-foreground font-normal">
            what submitting does
          </span>
        </Label>
        <div className="grid grid-cols-1 gap-2 mt-1">
          {PURPOSE_CARDS.map((card) => {
            const Icon = card.icon
            const isSelected = targetEntity === card.value
            return (
              <button
                key={card.value}
                type="button"
                disabled={readOnly}
                className={[
                  "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors w-full",
                  readOnly ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                  isSelected
                    ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary-soft))]"
                    : !readOnly
                      ? "border-[hsl(var(--border))] bg-card hover:bg-[hsl(var(--muted))]"
                      : "border-[hsl(var(--border))] bg-card",
                ].join(" ")}
                onClick={() => handleTargetChange(card.value)}
              >
                {/* Tinted icon box */}
                <div
                  className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
                  style={{
                    backgroundColor: `hsl(var(--tone-${card.accent}-bg))`,
                    color: `hsl(var(--tone-${card.accent}-fg))`,
                  }}
                >
                  <Icon size={15} />
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{card.name}</div>
                  <div className="text-xs text-muted-foreground">{card.desc}</div>
                </div>

                {/* Selected checkmark */}
                {isSelected && (
                  <CircleCheck
                    size={16}
                    className="text-[hsl(var(--primary))] flex-shrink-0"
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Intake forms bind to a template — the new project's Dept×Client×Discipline. */}
      {targetEntity === "intake" && (
        <div className="space-y-1.5">
          <Label htmlFor="fb-template">
            Project template{" "}
            <span className="text-destructive" title="Required to activate">*</span>
          </Label>
          <Select
            value={form.target_template_id ?? ""}
            onValueChange={handleTemplateChange}
            disabled={readOnly}
          >
            <SelectTrigger id="fb-template" aria-label="Project template">
              <SelectValue placeholder="Select a template…" />
            </SelectTrigger>
            <SelectContent>
              {deptTemplates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {deptTemplates.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No templates in this department yet.
            </p>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="fb-desc">
          Description{" "}
          <span className="text-xs text-muted-foreground font-normal">
            optional
          </span>
        </Label>
        <Textarea
          id="fb-desc"
          value={description}
          rows={2}
          placeholder="Shown at the top of the form"
          onChange={(e) => setDescription(e.target.value)}
          onBlur={commitDescription}
        />
      </div>
    </div>
  )
}
