import { ArrowRight, FileSpreadsheet, Upload } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
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
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  useFieldDefs,
  useMilestoneDefs,
  useTemplateList,
} from "@/api/templates"
import { useProjectImport, type ImportResult } from "@/api/projects"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Step = "pick" | "upload" | "map" | "result"

const SKIP = "__skip__"
const BUILTIN_TARGETS = [
  { value: "project_number", label: "Project # (required)" },
  { value: "client_project_number", label: "Client #" },
  { value: "title", label: "Title" },
]

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  // Minimal CSV parser — handles quoted cells + embedded quotes/commas.
  // Adequate for the spreadsheet export format flagged for v1; if a
  // user needs Excel's full quoting menagerie later we'll swap to
  // PapaParse.
  const out: string[][] = []
  let row: string[] = []
  let cell = ""
  let inQuotes = false
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      cell += ch
      i++
      continue
    }
    if (ch === '"') {
      inQuotes = true
      i++
      continue
    }
    if (ch === ",") {
      row.push(cell)
      cell = ""
      i++
      continue
    }
    if (ch === "\n" || ch === "\r") {
      row.push(cell)
      cell = ""
      if (row.some((c) => c !== "")) out.push(row)
      row = []
      // Eat CRLF
      if (ch === "\r" && text[i + 1] === "\n") i += 2
      else i++
      continue
    }
    cell += ch
    i++
  }
  // Trailing cell / row
  if (cell !== "" || row.length > 0) {
    row.push(cell)
    if (row.some((c) => c !== "")) out.push(row)
  }
  if (out.length === 0) return { headers: [], rows: [] }
  const [headers, ...rows] = out
  return { headers, rows }
}

export function ImportProjectsSheet({ open, onOpenChange }: Props) {
  const [step, setStep] = useState<Step>("pick")
  const [templateId, setTemplateId] = useState<string>("")
  const [file, setFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<{
    headers: string[]
    rows: string[][]
  } | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [result, setResult] = useState<ImportResult | null>(null)

  const templates = useTemplateList()
  const fieldDefs = useFieldDefs(templateId || undefined)
  const milestoneDefs = useMilestoneDefs(templateId || undefined)
  const importMutation = useProjectImport()

  // Reset on close so re-opening starts fresh.
  useEffect(() => {
    if (!open) {
      setStep("pick")
      setTemplateId("")
      setFile(null)
      setParsed(null)
      setMapping({})
      setResult(null)
      importMutation.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const customFields = fieldDefs.data?.items ?? []
  const milestones = milestoneDefs.data?.items ?? []
  const projectNumberMapped = useMemo(
    () =>
      Object.values(mapping).some((v) => v === "project_number"),
    [mapping],
  )

  const onFile = async (f: File) => {
    setFile(f)
    const text = await f.text()
    const next = parseCsv(text)
    setParsed(next)
    // Auto-match headers to built-ins + custom fields. Built-ins use
    // keyword stems (number / client / title) since users write
    // "Project #", "Project Number", etc. in their CSVs. Custom fields use
    // case-insensitive exact name match.
    const norm = (s: string) =>
      s.toLowerCase().replace(/[^a-z0-9]/g, " ").trim()
    const builtinStems: Array<{ value: string; stem: string }> = [
      { value: "project_number", stem: "number" },
      { value: "client_project_number", stem: "client" },
      { value: "title", stem: "title" },
    ]
    const autoMapping: Record<string, string> = {}
    for (const h of next.headers) {
      const hn = norm(h)
      // Try built-in stems first (number beats "Project Title" because we
      // check substring match in stem order).
      const builtin = builtinStems.find((b) =>
        hn === b.stem || hn.includes(b.stem),
      )
      if (builtin) {
        autoMapping[h] = builtin.value
        continue
      }
      // Then custom field exact-name match.
      const fd = customFields.find(
        (cf) => norm(cf.name) === hn,
      )
      if (fd) {
        autoMapping[h] = fd.id
        continue
      }
      // Then milestone name match. planned_actual mode defaults to
      // the planned slot; single mode uses the shorthand `milestone:<id>`.
      const md = milestones.find((m) => norm(m.name) === hn)
      if (md) {
        autoMapping[h] =
          md.date_model === "planned_actual"
            ? `milestone:${md.id}:planned`
            : `milestone:${md.id}`
        continue
      }
      autoMapping[h] = SKIP
    }
    setMapping(autoMapping)
  }

  const onCommit = async () => {
    const cleaned: Record<string, string> = {}
    for (const [col, target] of Object.entries(mapping)) {
      if (target && target !== SKIP) cleaned[col] = target
    }
    importMutation.mutate(
      { file: file!, templateId, mapping: cleaned },
      {
        onSuccess: (res) => {
          setResult(res)
          setStep("result")
          if (res.created > 0) {
            toast.success(`Imported ${res.created} project${res.created === 1 ? "" : "s"}`)
          }
        },
        onError: (err) => toast.error(err.detail),
      },
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col sm:max-w-xl"
      >
        <SheetHeader>
          <SheetTitle>Import projects</SheetTitle>
          <SheetDescription>
            Upload a CSV and map columns to fields. New projects only —
            duplicate Project #s are skipped.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 min-h-0 space-y-5 overflow-y-auto px-4 pb-4">
          {step === "pick" && (
            <section className="space-y-2">
              <label className="text-sm font-medium">Template</label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger
                  className="w-full"
                  aria-label="Import template"
                >
                  <SelectValue placeholder="Choose a template…" />
                </SelectTrigger>
                <SelectContent>
                  {(templates.data?.items ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={() => setStep("upload")}
                disabled={!templateId}
              >
                Next <ArrowRight className="ml-1 size-3.5" />
              </Button>
            </section>
          )}

          {step === "upload" && (
            <section className="space-y-2">
              <label className="text-sm font-medium">CSV file</label>
              <input
                type="file"
                accept=".csv,text/csv"
                aria-label="CSV file"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) onFile(f)
                }}
                className="block w-full text-sm"
              />
              {parsed && (
                <p className="text-xs text-muted-foreground">
                  {parsed.headers.length} columns · {parsed.rows.length} data row{parsed.rows.length === 1 ? "" : "s"}
                </p>
              )}
              <Button
                onClick={() => setStep("map")}
                disabled={!parsed || parsed.headers.length === 0}
              >
                Next <ArrowRight className="ml-1 size-3.5" />
              </Button>
            </section>
          )}

          {step === "map" && parsed && (
            <section className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Map each CSV column to a field. Unmapped columns are
                ignored. Project # must be mapped.
              </p>
              <ul className="space-y-2">
                {parsed.headers.map((h) => (
                  <li
                    key={h}
                    className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-sm">
                      <FileSpreadsheet
                        aria-hidden
                        className="size-3.5 shrink-0 text-muted-foreground"
                      />
                      <span className="truncate font-medium">{h}</span>
                    </span>
                    <Select
                      value={mapping[h] ?? SKIP}
                      onValueChange={(v) =>
                        setMapping((m) => ({ ...m, [h]: v }))
                      }
                    >
                      <SelectTrigger
                        className="h-8 w-[220px]"
                        aria-label={`Map ${h}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SKIP}>Skip</SelectItem>
                        {BUILTIN_TARGETS.map((b) => (
                          <SelectItem key={b.value} value={b.value}>
                            {b.label}
                          </SelectItem>
                        ))}
                        {customFields.map((fd) => (
                          <SelectItem key={fd.id} value={fd.id}>
                            {fd.name}
                          </SelectItem>
                        ))}
                        {milestones.flatMap((md) =>
                          md.date_model === "planned_actual"
                            ? [
                                <SelectItem
                                  key={`${md.id}-planned`}
                                  value={`milestone:${md.id}:planned`}
                                >
                                  {md.name} — Planned
                                </SelectItem>,
                                <SelectItem
                                  key={`${md.id}-actual`}
                                  value={`milestone:${md.id}:actual`}
                                >
                                  {md.name} — Actual
                                </SelectItem>,
                              ]
                            : [
                                <SelectItem
                                  key={md.id}
                                  value={`milestone:${md.id}`}
                                >
                                  {md.name} (milestone date)
                                </SelectItem>,
                              ],
                        )}
                      </SelectContent>
                    </Select>
                  </li>
                ))}
              </ul>
              {!projectNumberMapped && (
                <Alert variant="destructive">
                  <AlertTitle>Project # must be mapped</AlertTitle>
                  <AlertDescription>
                    Pick the column that holds each project's
                    project number before continuing.
                  </AlertDescription>
                </Alert>
              )}
              <Button
                onClick={onCommit}
                disabled={
                  !projectNumberMapped || !file || importMutation.isPending
                }
              >
                <Upload className="mr-1 size-3.5" />
                {importMutation.isPending
                  ? "Importing…"
                  : `Import ${parsed.rows.length} row${parsed.rows.length === 1 ? "" : "s"}`}
              </Button>
            </section>
          )}

          {step === "result" && result && (
            <section className="space-y-3">
              <p className="text-sm font-medium">
                {`${result.created} project${result.created === 1 ? "" : "s"} created.`}
              </p>
              {result.skipped.length > 0 && (
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    Skipped ({result.skipped.length})
                  </p>
                  <ul className="rounded-md border bg-background p-2 text-xs">
                    {result.skipped.map((s, i) => (
                      <li key={i}>
                        Row {s.row}
                        {s.project_number
                          ? ` (${s.project_number})`
                          : ""}
                        : {s.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.errors.length > 0 && (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-destructive">
                    Errors ({result.errors.length})
                  </p>
                  <ul className="rounded-md border bg-background p-2 text-xs">
                    {result.errors.map((e, i) => (
                      <li key={i}>
                        Row {e.row}: {e.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </section>
          )}
        </div>

        <SheetFooter />
      </SheetContent>
    </Sheet>
  )
}
