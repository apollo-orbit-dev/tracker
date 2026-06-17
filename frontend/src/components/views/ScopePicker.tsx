// Phase 7.14 — controlled DCD + lifecycle scope controls for the metric
// builder. Writes into a metric's `scope`. Cascade (dept→client→discipline)
// mirrors the dashboard WidgetConfigSheet, but this component is fully
// controlled: it derives selections from `scope` and emits a new scope via
// onChange — the dept-change reset happens in the handler, not an effect.
import type { MetricScope } from "@/api/views"
import { useMyDepartments } from "@/api/me"
import { useTaxonomyList } from "@/api/taxonomy"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { LIFECYCLE_STATES } from "./metricCatalog"
import { lifecycleLabel } from "@/lib/lifecycle"

const NONE = "__none__"

type Props = {
  scope: MetricScope
  show: { dcd: boolean; lifecycle: boolean }
  onChange: (next: MetricScope) => void
  idPrefix: string
}

export function ScopePicker({ scope, show, onChange, idPrefix }: Props) {
  const myDepts = useMyDepartments()
  const allClients = useTaxonomyList("clients", false)
  const allDisciplines = useTaxonomyList("disciplines", false)

  const deptId = scope.department_id ?? NONE
  const clientId = scope.client_id ?? NONE
  const disciplineId = scope.discipline_id ?? NONE
  const lifecycle = scope.lifecycle_state ?? NONE

  const clientsForDept = (allClients.data?.items ?? []).filter(
    (c) => deptId !== NONE && c.department_id === deptId,
  )
  const disciplinesForDept = (allDisciplines.data?.items ?? []).filter(
    (d) => deptId !== NONE && d.department_id === deptId,
  )

  // Cascade reset lives in the handler (controlled component): choosing a
  // department drops any client/discipline that belonged to the old one.
  const setDept = (v: string) =>
    onChange({
      ...scope,
      department_id: v === NONE ? null : v,
      client_id: null,
      discipline_id: null,
    })
  const setClient = (v: string) =>
    onChange({ ...scope, client_id: v === NONE ? null : v })
  const setDiscipline = (v: string) =>
    onChange({ ...scope, discipline_id: v === NONE ? null : v })
  const setLifecycle = (v: string) =>
    onChange({ ...scope, lifecycle_state: v === NONE ? null : v })

  return (
    <div className="space-y-3">
      {show.dcd && (
        <>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-dept`}>Department</Label>
            <Select value={deptId} onValueChange={setDept} disabled={myDepts.isLoading}>
              <SelectTrigger id={`${idPrefix}-dept`}>
                <SelectValue placeholder="All departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>All departments</SelectItem>
                {(myDepts.data ?? []).map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.code} — {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-client`}>Client</Label>
            <Select value={clientId} onValueChange={setClient} disabled={deptId === NONE}>
              <SelectTrigger id={`${idPrefix}-client`}>
                <SelectValue placeholder="All clients" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>All clients</SelectItem>
                {clientsForDept.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-discipline`}>Discipline</Label>
            <Select
              value={disciplineId}
              onValueChange={setDiscipline}
              disabled={deptId === NONE}
            >
              <SelectTrigger id={`${idPrefix}-discipline`}>
                <SelectValue placeholder="All disciplines" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>All disciplines</SelectItem>
                {disciplinesForDept.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.code} — {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {show.lifecycle && (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-lifecycle`}>Lifecycle</Label>
          <Select value={lifecycle} onValueChange={setLifecycle}>
            <SelectTrigger id={`${idPrefix}-lifecycle`}>
              <SelectValue placeholder="All states" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>All states</SelectItem>
              {LIFECYCLE_STATES.map((s) => (
                <SelectItem key={s} value={s}>
                  {lifecycleLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}
