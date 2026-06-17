// Phase 7.10 — chart block config section (split out of
// BlockConfigSheet; controls and gating unchanged from 7.7). Owns the
// kind / group-by / metric / money drafts — the metric and money
// states are now independent of the metric section's (the pre-split
// sheet reused one pair across both types; only one section mounts per
// block, so behavior is identical). pct_of_total is excluded from the
// builder (backend rejects it in grouped contexts), and a stale
// group_by (entity/template changed underneath it) fails groupByValid
// and disables Save until re-picked.
import { useEffect, useState } from "react"

import {
  type ChartBlockConfig,
  type MetricDefinition,
} from "@/api/views"
import { useFieldDefs } from "@/api/templates"
import { Segmented } from "@/components/Segmented"
import { MetricBuilder } from "@/components/views/MetricBuilder"
import {
  groupableOptionsFor,
  metricProblems,
} from "@/components/views/metricCatalog"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

import { GroupBySelect } from "./GroupBySelect"
import {
  groupByFromConfig,
  metricFromConfig,
  type SectionProps,
} from "./shared"

export function ChartConfigSection({ initialConfig, onState }: SectionProps) {
  const ccfg = (initialConfig ?? {}) as Partial<ChartBlockConfig>
  const [metric, setMetric] = useState<MetricDefinition>(() =>
    metricFromConfig(initialConfig),
  )
  const [money, setMoney] = useState(!!ccfg.money)
  const [chartKind, setChartKind] = useState<"bar" | "donut">(
    ccfg.kind === "donut" ? "donut" : "bar",
  )
  const [groupBy, setGroupBy] = useState(() => groupByFromConfig(initialConfig))

  const templateId =
    metric.entity === "project" ? (metric.template_id ?? undefined) : undefined
  const fieldsQ = useFieldDefs(templateId)
  const customFields = templateId ? (fieldsQ.data?.items ?? []) : []
  const fieldsReady = !templateId || fieldsQ.data !== undefined
  const groupOpts = groupableOptionsFor(metric.entity, customFields)
  const groupByValid = groupOpts.some((o) => o.ref === groupBy)

  const valid =
    fieldsReady &&
    groupByValid &&
    metricProblems(metric, customFields).length === 0
  const hint = valid
    ? ""
    : " Finish the metric and pick a group-by to enable Save."

  useEffect(() => {
    const config: ChartBlockConfig = {
      metric,
      group_by: groupBy,
      kind: chartKind,
      money,
    }
    onState({
      config: config as unknown as Record<string, unknown>,
      valid,
      hint,
    })
    // onState is referentially stable (a setState in the shell).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric, groupBy, chartKind, money, valid, hint])

  return (
    <>
      <div className="space-y-1.5">
        <Label>Chart kind</Label>
        <div>
          <Segmented<"bar" | "donut">
            aria-label="Chart kind"
            value={chartKind}
            onChange={setChartKind}
            options={[
              { value: "bar", label: "Bar" },
              { value: "donut", label: "Donut" },
            ]}
          />
        </div>
      </div>

      <GroupBySelect
        groupBy={groupBy}
        groupByValid={groupByValid}
        groupOpts={groupOpts}
        onChange={setGroupBy}
      />

      <MetricBuilder value={metric} onChange={setMetric} excludePct />

      <div className="flex items-center justify-between">
        <Label htmlFor="block-cfg-money">Format as money</Label>
        <Switch
          id="block-cfg-money"
          checked={money}
          onCheckedChange={setMoney}
        />
      </div>
    </>
  )
}
