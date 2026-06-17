// Phase 7.10 — metric card config section (split out of
// BlockConfigSheet; controls and gating unchanged from 7.4). Owns the
// metric draft plus thresholds / money / compact. Save gating mirrors
// the pre-split sheet: the metric must pass metricProblems once field
// defs are loaded, and thresholds are both-or-none (both finite). The
// field-defs query shares its key with the one inside MetricBuilder,
// so it adds no extra fetch.
import { useEffect, useState } from "react"

import {
  type MetricCardConfig,
  type MetricDefinition,
} from "@/api/views"
import { useFieldDefs } from "@/api/templates"
import { MetricBuilder } from "@/components/views/MetricBuilder"
import { metricProblems } from "@/components/views/metricCatalog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

import { metricFromConfig, type SectionProps } from "./shared"

export function MetricConfigSection({ initialConfig, onState }: SectionProps) {
  const mcfg = (initialConfig ?? {}) as Partial<MetricCardConfig>
  const [metric, setMetric] = useState<MetricDefinition>(() =>
    metricFromConfig(initialConfig),
  )
  const [green, setGreen] = useState(
    mcfg.thresholds ? String(mcfg.thresholds.green) : "",
  )
  const [amber, setAmber] = useState(
    mcfg.thresholds ? String(mcfg.thresholds.amber) : "",
  )
  const [money, setMoney] = useState(!!mcfg.money)
  const [compact, setCompact] = useState(!!mcfg.compact)

  const templateId =
    metric.entity === "project" ? (metric.template_id ?? undefined) : undefined
  const fieldsQ = useFieldDefs(templateId)
  const customFields = templateId ? (fieldsQ.data?.items ?? []) : []
  const fieldsReady = !templateId || fieldsQ.data !== undefined

  const metricIncomplete =
    !fieldsReady || metricProblems(metric, customFields).length > 0

  const greenN = green.trim() === "" ? null : Number(green)
  const amberN = amber.trim() === "" ? null : Number(amber)
  const thresholdsInvalid =
    // both-or-none, and both must be real numbers
    (greenN === null) !== (amberN === null) ||
    (greenN !== null && !Number.isFinite(greenN)) ||
    (amberN !== null && !Number.isFinite(amberN))

  const valid = !metricIncomplete && !thresholdsInvalid
  const hint =
    (metricIncomplete ? " Finish the metric to enable Save." : "") +
    (thresholdsInvalid
      ? " Thresholds need both numbers (or leave both blank)."
      : "")

  useEffect(() => {
    const config: MetricCardConfig = {
      metric,
      thresholds:
        greenN !== null && amberN !== null
          ? { green: greenN, amber: amberN }
          : null,
      money,
      compact,
    }
    onState({
      config: config as unknown as Record<string, unknown>,
      valid,
      hint,
    })
    // onState is referentially stable (a setState in the shell).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric, green, amber, money, compact, valid, hint])

  return (
    <>
      <MetricBuilder value={metric} onChange={setMetric} />

      <div className="space-y-1.5">
        <Label htmlFor="block-cfg-green">Thresholds (optional)</Label>
        <div className="flex items-center gap-1.5">
          <Input
            id="block-cfg-green"
            type="number"
            aria-label="Green threshold"
            placeholder="Green ≤"
            value={green}
            onChange={(e) => setGreen(e.target.value)}
          />
          <Input
            id="block-cfg-amber"
            type="number"
            aria-label="Amber threshold"
            placeholder="Amber ≤"
            value={amber}
            onChange={(e) => setAmber(e.target.value)}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Values ≤ green show green, ≤ amber show amber, above show
          red. Fill both or neither.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <Label htmlFor="block-cfg-money">Format as money</Label>
        <Switch
          id="block-cfg-money"
          checked={money}
          onCheckedChange={setMoney}
        />
      </div>
      <div className="flex items-center justify-between">
        <Label htmlFor="block-cfg-compact">
          Compact large values (e.g. $250k)
        </Label>
        <Switch
          id="block-cfg-compact"
          checked={compact}
          onCheckedChange={setCompact}
        />
      </div>
    </>
  )
}
