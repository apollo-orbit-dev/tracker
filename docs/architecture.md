# Architecture

## Current state
Pilot-approved POC, built through **Phase 7 (Custom Views)** and tagged `v0.7.0`. The stack below is in production-shape use, not a proposal. Core domain (auth, RBAC with dept-scoped visibility, taxonomy, templates, projects/milestones/CORs/notes/contacts/role-assignments, audit log), user dashboards, per-template Saved Views (with spreadsheet import/export), and Custom Views are all shipped and tested (~726 backend + ~330 frontend). See the **Data model overview** and **Custom Views** sections below for the built shape. The original Phase 0/1/2+ roadmap at the end of this file is kept for historical context only.

## Proposed stack

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | Vite + React + TypeScript + shadcn/ui + TanStack Query | Polished out of the box for the management demo; TanStack Query gives clean server-state handling for the heavy CRUD this app does. |
| Backend | FastAPI + SQLAlchemy + Alembic | Async, ergonomic, strong Pydantic validation at the boundary. SQLAlchemy + Alembic gives proper migrations for a long-lived schema. |
| Database | PostgreSQL | Production-grade from day one — no SQLite-to-Postgres rewrite later. Comfortably handles the expected load (1,000-employee firm, ~50–150 peak concurrent). |
| Auth | Argon2 + signed-cookie sessions | Provider-agnostic by design — local auth now, swap for Okta SSO later without schema migration. |
| Runtime | Docker Compose (single-host) | Same compose file runs on dev machine, demo VPS, and the eventual Northwind server. |

## Deployment target

- **POC phase**: Docker Compose on a dev machine or a temporary VPS for the upper-management demo.
- **Production phase** (post-greenlight): Northwind internal server, redeployed using the same Docker Compose stack. No code changes expected — just hardware and environment swap.

## Notable constraints

- **Auth abstraction.** Local Argon2 auth must be cleanly swappable for Okta OIDC. The user model stores a Northwind-internal UUID; an `auth_providers` table records how a user authenticates (`local` with password hash, or `okta` with subject claim). RBAC stays in-app — never derived from Okta groups — so the migration is mechanical, not data-shaping.
- **Scale targets.** 1,000-employee company, realistic peak ~50–150 concurrent users. Stack is over-provisioned for this load. Bottlenecks at this size are query patterns (N+1, missing indexes, unbounded list endpoints), not the stack itself.
- **Forward-scaling discipline** to apply from day one:
  - SQLAlchemy eager-loading where relationships are read; query-count assertions in tests to catch N+1 regressions.
  - All list endpoints paginated server-side.
  - Indexes on filter columns (`department_id`, `lifecycle_state`, `project_lead_user_id`, milestone `planned_date`, audit log `(entity_type, entity_id, timestamp)`).
  - Structured logging with request IDs.
- **POC visual fidelity.** Phase 1 includes "Coming Soon" placeholder UI for Phase 2+ features so the demo communicates the full vision.

---

## Frontend design system (Phase 4)

Phase 4 swaps the visual layer to a Linear-inspired design. The refactor is per-page over sub-phases 4.1–4.7; the foundation landed in 4.1:

- **Design tokens** in `frontend/src/index.css` — bare-HSL custom properties (`--bg`, `--fg`, `--card`, `--border`, `--primary`, etc.) plus six semantic tones (`--tone-{slate|emerald|amber|indigo|rose|blue}-{bg|fg|dot}`) for status badges and indicator dots. Tailwind's `@theme inline` block aliases the shadcn semantic names (`bg-background`, `text-foreground`, etc.) to the new tokens so existing components inherit the palette without rewrites.
- **Dual theme** light + dark via `data-theme="dark"` on `document.documentElement` (also adds the `.dark` class for shadcn compatibility). Toggled by `useTheme()`, persisted in `localStorage` under `tracker.theme`. Default light.
- **Density toggle** comfortable + compact via `data-density="compact"`. Affects `--row-h` / `--row-py` / `--fs-table`. Hooked via `useDensity()`, persisted under `tracker.density`. Default comfortable.
- **App shell** — `AppLayout` keeps shadcn's `Sidebar` wrapper but the contents follow the new design: brand mark + Tracker wordmark, primary nav, a Saved Views placeholder section (the real feature is deferred indefinitely per Phase 4 scoping), and a footer user menu with theme/density toggles + sign-out. A new `Topbar` component sits above the routed page content with a (placeholder) command-K trigger, theme toggle, and notifications icon.
- **New primitives** in `frontend/src/components/` — `Badge` (six tones + optional dot), `Avatar` (auto-hued from a deterministic name hash via `lib/avatar.ts`), `Segmented` (button-based toggle group used by Phase 4.2+ list/detail/dashboard mode switches), `Kbd` (small key-glyph wrapper).

Phase 4.1 is intentionally **transitional**: existing pages still render their `PageHeader`-based markup inside the new chrome, which means most pages temporarily carry two header strips (the topbar above and their own `PageHeader` below). Per-page redress in 4.2–4.5 moves breadcrumb data into the topbar via a context introduced in 4.2 and removes each page's `PageHeader` usage.

---

## Data model overview

This is the high-level shape, not the final schema. Phase 1 sub-phases will refine and migrate it.

**Identity & access**
- `users` — Northwind-internal UUID, email, display name, lifecycle state. Nullable `okta_subject` column for future SSO migration.
- `auth_providers` — links a user to `local` (password_hash) or `okta` (subject) authentication. Supports a user having both during a migration window.
- `roles` — Admin, Department Manager, Project Editor, Viewer.
- `user_roles` — many-to-many; some roles are scoped (e.g., Department Manager scoped to a department).

**Taxonomy (no inheritance — every leaf is independent)**
- `departments` — e.g., DIV1
- `clients` — e.g., CON, WTP
- `disciplines` — e.g., Design, Physical, Settings, Scoping

**Templates** — each template is the (Department, Client, Discipline) intersection.
- `templates` — name + the three taxonomy FKs
- `template_field_defs` — custom field definitions on the project record (name, type, required, order, options-for-select-types)
- `template_milestone_defs` — milestone definitions that auto-create when a project is spun up (name, direction, date_model: `single` or `planned_actual`, order)

**Projects & their entities**
- `projects` — project number (e.g., `25756601`), client project number, title, template_id, lifecycle_state, custom_field_values (JSONB keyed by field def id), audit-relevant scalar columns
- `milestones` — per project; `name`, `direction`, `planned_date`, `actual_date` (nullable), `date_model`, `template_milestone_def_id` (nullable for ad-hoc), `order`
- `cors` — per project; number, description, amount, dates, status
- `notes` — per project; text, created_by, created_at
- `contacts` — reusable POC records (name, email, phone, org)
- `project_contacts` — many-to-many between projects and contacts, with role label
- `project_role_assignments` — many-to-many between projects and users with role label (Lead, Designer, Checker, QA, etc.), allowing multiple users per role

**System**
- `audit_log` — entity_type, entity_id, field_name, old_value, new_value, changed_by, changed_at. Field-level history for budget/date/status fields; entity-level for others.
- `soft_delete` columns on top-level entities (`deleted_at`, `deleted_by`) — admin restore window before hard cleanup.

**User-scoped UI prefs**
- `user_dashboards` + `user_dashboard_widgets` — per-user dashboard tabs and the widget set on each (Phase 2.4).
- `user_dashboard_widgets.config` JSONB also stores a `future_days` integer (1..365) for `milestone_lookahead` widgets — added Phase 2.8. Unset → backend default of 60.
- `user_dashboard_widgets.column_pos` (SMALLINT, 0 or 1) — added Phase 2.11. Which column a half-width widget renders in; ignored when `width = 2`. Migration 0017 backfills `column_pos` to mirror the previous CSS grid auto-flow so existing dashboards render identically. The reorder endpoint accepts both the legacy `ordered_ids` payload and the new `items: [{id, column}]` payload.
- `user_project_view_columns` — per-user-per-template column prefs for the Phase 2.7 viewing list at `/projects/view?template_id=<uuid>`. Stores an ordered list of column-key strings (`builtin:*`, `custom_field:<uuid>`, `milestone:<uuid>:date|planned|actual`) plus an optional sort selection (built-in keys only). One row per `(user_id, template_id)`, FK-cascaded off both. `GET /api/projects` gained `sort`, `sort_direction`, `expand_refs`, `expand_milestones` query params in the same phase to support the viewing list.

**Custom field types** (defined in template_field_defs):
short text, long text, URL, email, phone, integer, decimal, currency, percent, auto-number, date, date+actual pair, date range, duration, single-select, multi-select, boolean, boolean+conditional date, boolean+conditional text, user picker (single), user picker (multi), contact picker, project reference, client reference.

**Milestone directions** (fixed system enum):
- `outbound` — we deliver to client (IFC submittal, As-Builts, 30% submittal)
- `inbound` — we receive from client (NTP received, QA comments received)
- `internal` — Northwind-only (KOM completed, Lessons Learned)
- `external` — calendar/reference (IFQ date, contract execution)

---

## Custom Views (Phase 7, sub-phases A–D)

User-composed pages under the sidebar's "Saved Views" group: each view
is a grid of blocks (metric cards and text blocks in sub-phase A,
Phases 7.1–7.4.1; chart and breakdown blocks plus drill-down in
sub-phase B, Phases 7.5–7.8; the embedded Saved View table block and
the personal saved-metrics library in sub-phase C, Phases 7.9–7.12).

**Per-block scope** (Phase 7.14, the scope slice of sub-phase D):
narrowing lives on each block's metric, not on a view-level scope bar
(that bar was dropped). The metric builder mounts a controlled
`ScopePicker` (`frontend/src/components/views/ScopePicker.tsx`)
exposing cascading Department → Client → Discipline + Lifecycle
selects that write into `metric.scope`. DCD is hidden when a project
template is selected (the template already pins its dept/client/
discipline intersection — and selecting a template clears any DCD
scope); lifecycle is always offered; for milestone/cor metrics DCD +
lifecycle both show (no template control). Breakdown columns share one
scope (column 1 owns the controls; a scope change propagates to every
column's `metric.scope` without resetting their aggregation/target/
conditions — scope is a pure filter, unlike an entity/template change,
which still resets the columns' fields). The backend was already the
enforcement boundary: `validate_metric` validates the four scope
fields and `_scoped_base` applies them on eval, block-data, and
drill-down — Phase 7.14 only surfaced them in the UI (plus one backend
regression test).

**Sharing model** (Phases 7.15–7.16, sub-phase D-proper): a view's
owner who is a department manager of a target dept (or an admin) can
**publish** the view to that department, making it read-only-visible to
that dept's members. The backend enforces a **read-vs-write access
split**: write paths (rename, blocks CRUD/reorder, delete, publish,
unpublish) stay owner-only via `_fetch_view` (non-owners get 404, no
existence leak); the two read paths (`list_blocks`, `block_data`) use
`_fetch_view_readable`, which also admits a view whose
`published_department_id` is in the caller's `accessible_department_ids`
(`None` = org admin = all). `POST /api/views/{vid}/publish` (body
`{department_id}`) fetches as owner first, then runs
`assert_can_manage_dept` (403 unless admin/DM-of-dept);
`/unpublish` (owner-only) clears it. **Reader data is auto-scoped to the
reader's own access** — block data is evaluated through the metric
engine with the *reader's* `accessible_department_ids`, not the
owner's, so a reader sees numbers scoped to their own access and a block
referencing a template they can't access returns the engine's 422
(correct behavior, surfaced as the block's existing error state). Anyone
with read access can `POST /api/views/{vid}/duplicate` into a personal
copy (`"<name> (copy)"`, publish cleared, all blocks deep-copied).
`GET /api/views` returns owned views (by `order_index`) plus shared
views (by name), each flagged `is_owner` with `owner_name` and
`published_department_code`; `GET /api/auth/me/manageable-departments`
lists the depts a caller can publish to and powers the Share menu.
Frontend (`ViewPage.tsx`): non-owners get a read-only page (no Edit;
"Published by X · read-only" subtitle; a Duplicate button), owners get a
Share dropdown (publish-per-manageable-dept / unpublish) in edit mode; a
"Shared · CODE" badge shows in the header for both, the sidebar marks
shared views with the Users icon + dept code, and the command palette
lists saved views + a "New view" action. **Deferred** (open items):
copy-link, print stylesheet, DM-moderation unpublish of others' views.

**Storage** (migration `0022_custom_views`):
- `custom_views` — owner-scoped (`owner_user_id`, CASCADE), `name`
  (≤120), `order_index`, soft delete (`deleted_at`/`deleted_by`).
  `published_department_id` + `scope` (JSONB) exist now but stay
  unused until the rest of sub-phase D (publishing) — the view-level
  scope bar that `scope` was reserved for was dropped in favor of
  per-block metric scope (Phase 7.14), so the column stays vestigial
  but no second migration is needed.
- `custom_view_blocks` — `view_id` (CASCADE), `block_type` (CHECK:
  metric/chart/breakdown/table/text), `title` (≤200), `order_index`,
  `width` (CHECK: 1/2/4 grid columns), `accent` (CHECK: 6 named
  colors), `config` (JSONB). Max 30 blocks per view (route-enforced).
- `saved_metrics` (migration `0023_saved_metrics`) — the personal
  metric library: `owner_user_id` (CASCADE), `name` (≤120), `config`
  (JSONB, a `MetricDefinition` dict). Hard delete (lightweight
  personal rows, mirrors widgets); 50 per user, route-enforced.

**Routes** (`backend/app/routes/views.py`, `routes/metrics.py`,
`routes/saved_metrics.py`):
owner-scoped CRUD + reorder + duplicate for views and blocks
(mirroring the dashboard-widget pattern), a per-block data endpoint
(`GET /api/views/{vid}/blocks/{bid}/data` — returns a
`kind`-discriminated union: metric value, chart group rows, or
breakdown rows, all evaluated from the block's stored config),
`POST /api/metrics/eval` (evaluates an ad-hoc `MetricDefinition`;
powers the builder's live preview), and `POST /api/metrics/eval/rows`
(drill-down: the entity rows behind a metric or one group bucket,
capped at 100 with a `total` count; `group_by` + `group_value: null`
addresses the unset/"—" bucket, and `group_value` without `group_by`
is rejected). Sub-phase C added `/api/saved-metrics` — owner-scoped
CRUD over the personal library; configs are semantically validated by
`validate_metric` on every create/update, and "apply" in the UI
copies the config into the builder (no live link — deleting a saved
metric never affects blocks built from it).

**Metric engine** (`backend/app/services/metric_engine.py`): compiles
a whitelisted `MetricDefinition` — entity (project/milestone/cor) +
aggregation (count, count_distinct, sum/avg/min/max, pct_of_total) +
up to 10 AND/OR conditions + optional scope — into bound-parameter
SQLAlchemy. No formula language, no string SQL. Field refs are either
fixed built-ins per entity or custom-field UUIDs resolved against live
`TemplateFieldDef` rows on the metric's `template_id` (required for
any custom-field ref; the engine adds a `Project.template_id` filter).
`date_planned_actual` / `date_range` fields are addressed only through
virtual date sub-refs (`<uuid>.planned`/`.actual`, `<uuid>.start`/
`.end`); `url`/`email`/`phone` condition as text. Operators are
whitelisted per field kind (boolean/select/number/date/text); select
values are validated against the field's options. Date ops include the
no-value presets `this_month`, `this_quarter`, and (Phase 7.17/7.18)
`last_month` (previous calendar month) and `on_or_before_today` ("≤
today", date ≤ today — distinct from the strict `before`); the frontend
catalog keeps these in one `NO_VALUE_DATE_OPS` set so the builder never
renders a value input for them. Results are
dept-scoped via `accessible_department_ids` + directly-granted
projects, same as every other read path.

Sub-phase B added two more evaluation paths sharing the same scoped
base + condition compiler: `evaluate_grouped` (GROUP BY a whitelisted
groupable field — kind select or boolean, multi-select excluded, plus
the built-ins lifecycle_state / direction / status; rows sorted by
value desc, top 12 kept, the tail collapsed into a synthetic "Other"
row, NULLs labeled "—"; both synthetic buckets are flagged
`is_null`/`is_other` so display labels are never load-bearing) and
`drill_rows` (the rows behind a metric or one group bucket, capped at
`DRILL_ROW_CAP` = 100, each row carrying `project_id` for
click-through). Chart blocks store `ChartBlockConfig` (metric +
group_by + bar/donut + money hint) and breakdowns
`BreakdownBlockConfig` (group_by + 1–4 metric columns sharing one
entity/template), both semantically validated by
`validate_block_config`; `pct_of_total` is rejected anywhere grouped.

**Where validation lives:**
- Pydantic shapes (`MetricDefinition`, `MetricCardConfig`,
  view/block create/update) in `backend/app/schemas/views.py` —
  boundary type/length validation.
- Semantic validation (`validate_metric`, `validate_block_config`) in
  `metric_engine.py` — field/op/aggregation whitelists, template
  access, option membership, threshold ordering. Used by both the
  eval endpoint and block create/update, so a bad config can neither
  be previewed nor persisted.
- The frontend mirrors the same catalogs for UX only (pure module
  `frontend/src/components/views/metricCatalog.ts`, consumed by
  `MetricBuilder.tsx` and the chart/breakdown config sections); it
  never evaluates anything client-side — the live preview round-trips
  through `/api/metrics/eval` and every block number comes from the
  block-data endpoint.

**Frontend** (`frontend/src/pages/ViewPage.tsx` + 
`frontend/src/components/views/*`, hooks in `frontend/src/api/views.ts`):
`/views/:vid` routes; sidebar lists custom views in the Saved Views
group with "+ New view". Read mode is inert; edit mode (`E` or the
Edit button) adds inline rename, the block library, kebab actions
(configure/duplicate/remove), and dnd-kit drag-reorder. The config
sheet (`BlockConfigSheet`) hosts title/width/accent for every type,
text fields for text blocks (rendered strictly as plain React text
nodes — no raw HTML), the metric builder + thresholds + money/compact
toggles for metric cards, and the chart (bar/donut + group-by + money)
and breakdown (group-by + 1–4 columns, columns 2+ locked to column 1's
entity/template) sections. Metric values render in `MetricCardBlock`
with green/amber/red threshold tones; all value display goes through
one shared formatter (`formatValue` in `metricCatalog.ts` — money,
compact, `%` for pct_of_total).

Charts render in `ChartBlock` — bars as an accessible labeled bar
list (buttons with CSS tracks; see the 2026-06-10 decision-log entry),
donuts via **Recharts** (`PieChart`/`Pie`, the only Recharts usage)
beside a clickable button legend. Breakdowns render in
`BreakdownBlock` as a shadcn table. Clicking a configured metric card
or a chart group opens `DrillDownSheet`, which posts the block's
stored metric (plus the clicked group bucket, derived from the
`is_null` flag — never label text) to `/api/metrics/eval/rows` and
lists the matching rows as links to their projects; the synthetic
"Other" bucket is not drillable. The donut is the only lazily-loaded
chunk: `DonutChart.tsx` (the sole Recharts importer) is
`React.lazy`-loaded behind a Suspense fallback + error boundary, so
pages without a donut never download Recharts (Phase 7.10).

**Saved View table block** (sub-phase C, Phases 7.9 + 7.11): the
fifth block type embeds one template's project table. The block
stores CONFIG only — `{template_id, columns (1–8, view_columns
grammar: builtin:* / custom_field:<uuid> /
milestone:<uuid>:date|planned|actual), lifecycle_state, q, limit
(6/10/15), sort, sort_direction}` — validated server-side by
`validate_block_config`'s table branch (template accessible, columns
parse + belong to the template + live, no duplicates, sort key
whitelisted). Its DATA path is the existing `GET /api/projects` with
`expand_refs`/`expand_milestones`, called from `TableBlock.tsx` via
`useProjectList` — identical auth/visibility to the Saved View page
it embeds, no new data endpoint, and cells/headers render through the
same shared module the page uses
(`frontend/src/components/projects/cellRender.tsx`). Rows link to the
project; "View all {total} →" links to `/projects/view` when the
result set exceeds the block's limit. The config section prunes
stored column keys that no longer exist on the template once defs
load (deleted fields/milestones would otherwise jam the 8-cap and 422
on save). Phase 7.18 added optional **field conditions** to the table
block: the config carries a `conditions` (`MetricConditions` shape) that
reuses the metric engine's compiler via a public
`compile_project_conditions` seam — `validate_block_config` runs it to
reject bad refs/ops at save, and the data path passes it to
`GET /api/projects?conditions=` (a JSON-encoded `MetricConditions`,
requires `template_id`, validated → 422 on bad JSON/refs/ops; other
`/api/projects` consumers never send it). The config UI reuses the
extracted `ConditionsEditor` (the condition-row component shared with
the metric builder), scoped to the template's built-ins + custom fields,
and resets the conditions on a template change.

**Saved metrics library UI** (Phase 7.12): `SavedMetricsMenu`
(hooks in `frontend/src/api/saved_metrics.ts`) mounts in
MetricBuilder's header for every consumer — metric cards, chart
metrics, and breakdown columns. It lists the owner's saved metrics
(apply = `structuredClone` of the stored config into the builder,
re-validated by the preview/save paths), offers per-metric delete,
and a "Save current as…" dialog that POSTs the builder's current
draft.

---

## Phase plan

> **Historical (as of 2026-06-11).** This is the *original* roadmap from Phase 0. The project has since shipped through Phase 7; many "Phase 2+ deferred" items below were built (dashboards, Saved Views, 2-week lookahead, spreadsheet exports, Custom Views). For the current built shape see the sections above. Still genuinely deferred: Okta SSO, backup/restore drill (reserved Phases 6.1/6.2), Gantt charts, email notifications, COR approval workflow, QuickBooks/Power BI integrations, client portal, and Custom Views metric snapshots (open item 40).

### Phase 0 — Scaffolding (this phase)
Documentation skeleton, test runners (pytest + Vitest), initial commit. No application code.

### Phase 1 — MVP backend + minimal UI (proof of concept)

The deliverable is a working app with full CRUD for the core entities and placeholder UI for analytics, ready to demo to upper management.

**1.1 Project skeleton & Docker compose** — backend service, frontend service, Postgres service, all wired up; health check endpoint.
**1.2 Schema foundation + migrations** — users, roles, auth_providers; initial Alembic migration; seed script harness.
**1.3 Local auth + sessions** — registration disabled; bootstrap admin only; login/logout; signed-cookie sessions with `Secure`, `HttpOnly`, `SameSite`; password hashing with Argon2.
**1.4 RBAC** — roles + scoped permissions; permission checks at route handlers; admin-only routes for taxonomy/template management.
**1.5 Taxonomy CRUD** — departments, clients, disciplines (admin only).
**1.6 Template builder** — custom field defs + milestone defs per (Dept, Client, Discipline); the full field-type catalog.
**1.7 Projects CRUD** — create from template (auto-generates milestones), edit custom field values, lifecycle state transitions with required-field enforcement, soft delete.
**1.8 Milestones, CORs, notes, contacts** — full CRUD; ad-hoc milestones beyond the template.
**1.9 Project role assignments** — Lead / Designer / Checker / QA etc., supporting multiple users per role.
**1.10 Audit log** — record-level audit for all entities; field-level history for budget, dates, lifecycle state.
**1.11 Demo seed data** — multiple departments, clients, templates (including DIV1-CON-Design and DIV1-WTP-Design), ~15 realistic projects across lifecycle states, populated audit log.
**1.12 Placeholder UI for Phase 2+** — "Coming Soon" nav items and dashboard tiles for the deferred features.

### Phase 2+ — Deferred features ("Coming Soon" placeholders in Phase 1)

- All Projects Overview Dashboard (department-grouped, selectable)
- Per Project Dashboard
- All Projects Gantt chart
- Per Project Gantt chart
- 2-week lookahead
- "My Projects" view
- Overdue / upcoming widgets (driven by milestone direction)
- Saved filters / views
- Global search across projects, notes, contacts
- Email notifications (deadline approaching, assigned, status change)
- Stale project alerts
- COR approval workflow
- Project templates with default-milestone relative offsets
- Clone existing project
- Excel / PDF status report exports
- Workload / capacity view
- Holiday / non-working-day calendar
- RAID log (Risks, Actions, Issues, Decisions)
- Lessons Learned register (department-level, searchable)
- **Okta SSO migration**
- QuickBooks spend-to-date integration
- Power BI / public REST API
- Client portal

---

This document is updated at the end of every phase that changes the architecture.
