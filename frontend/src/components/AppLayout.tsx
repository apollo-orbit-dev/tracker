import {
  Calendar,
  ClipboardList,
  Eye,
  LayoutDashboard,
  ListTodo,
  MoreHorizontal,
  Plus,
  Rows3,
  Settings2,
  Shield,
  SquareDashedKanban,
  Users,
} from "lucide-react"
import { useState } from "react"
import { NavLink, Outlet, useLocation, useNavigate } from "react-router"
import { toast } from "sonner"

import { ApiError } from "@/api/auth"
import { CommandPalette } from "@/components/CommandPalette"
import { Topbar } from "@/components/Topbar"
import { TopbarProvider } from "@/components/topbar/TopbarContext"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { useTemplateList } from "@/api/templates"
import { type CustomView, useViewCreate, useViews } from "@/api/views"
import { type FormListItem, useFormList } from "@/api/forms"
import { useAuth, useLogout } from "@/hooks/useAuth"
import { useCommandPalette } from "@/hooks/useCommandPalette"
import { useDensity } from "@/hooks/useDensity"
import { useGShortcuts } from "@/hooks/useGShortcuts"
import { useLocalStorage } from "@/hooks/useLocalStorage"
import { useTheme } from "@/hooks/useTheme"
import { hasRole } from "@/lib/roles"

type Item = {
  label: string
  to: string
  icon: React.ComponentType<{ className?: string }>
  end?: boolean
  visible: (roles: ReadonlyArray<string>) => boolean
}

const TOP_ITEMS: Item[] = [
  {
    label: "Dashboard",
    to: "/",
    icon: LayoutDashboard,
    end: true,
    visible: () => true,
  },
  {
    label: "Projects",
    to: "/projects",
    icon: ListTodo,
    visible: () => true,
  },
  {
    label: "Calendar",
    to: "/calendar",
    icon: Calendar,
    visible: () => true,
  },
]

const BOTTOM_ITEMS: Item[] = [
  {
    label: "User Settings",
    to: "/settings",
    icon: Settings2,
    visible: () => true,
  },
  {
    label: "Admin Settings",
    to: "/admin",
    icon: Shield,
    visible: (roles) => hasRole(roles, "department_manager"),
  },
]

function initialsOf(email: string): string {
  const local = email.split("@")[0] ?? email
  const parts = local.split(/[.\-_]/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return local.slice(0, 2).toUpperCase()
}

// 4.8.1 design-ref active state. The shadcn default uses a flat
// `bg-sidebar-accent` for active; the reference (`styles.css:114-119`)
// uses a card-coloured background plus a 1px border ring and a subtle
// drop shadow — gives the active row a slightly elevated chip look
// without shifting layout. Icons flip to the primary color on active.
const NAV_ITEM_CLASS =
  "text-muted-foreground hover:bg-muted hover:text-foreground " +
  "data-[active=true]:bg-card data-[active=true]:text-foreground " +
  "data-[active=true]:font-medium " +
  "data-[active=true]:shadow-[0_0_0_1px_hsl(var(--border)),0_1px_1px_rgb(0_0_0/0.03)] " +
  "[&>svg]:text-[hsl(var(--subtle-fg))] " +
  "data-[active=true]:[&>svg]:text-primary"

// 5.1: Saved-view sidebar item — active only when both the path
// matches /projects/view AND the URL's `template_id` query param
// matches this item's. Plain NavLink would mark *every* saved view as
// active whenever the user is on /projects/view (it ignores query),
// which is the wrong cue when the user has 6 templates in this group.
function SavedViewItem({
  label,
  templateId,
}: {
  label: string
  templateId: string
}) {
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  const isActive =
    location.pathname === "/projects/view" &&
    params.get("template_id") === templateId
  return (
    <SidebarMenuItem>
      <NavLink
        to={`/projects/view?template_id=${templateId}`}
        className="contents"
      >
        <SidebarMenuButton
          isActive={isActive}
          tooltip={label}
          className={NAV_ITEM_CLASS}
        >
          <Eye className="size-4" />
          <span>{label}</span>
        </SidebarMenuButton>
      </NavLink>
    </SidebarMenuItem>
  )
}

// 7.3: custom view sidebar item — active on an exact path match so
// only the view being looked at lights up (mirrors SavedViewItem's
// approach for template views).
// 7.16: shared views (someone else's view published to a dept I can
// see) use the Users icon and surface the source dept code, so they're
// visually distinct from the user's own views.
function CustomViewItem({ view }: { view: CustomView }) {
  const location = useLocation()
  const isActive = location.pathname === `/views/${view.id}`
  const Icon = view.is_owner ? SquareDashedKanban : Users
  return (
    <SidebarMenuItem>
      <NavLink to={`/views/${view.id}`} className="contents">
        <SidebarMenuButton
          isActive={isActive}
          tooltip={view.name}
          className={NAV_ITEM_CLASS}
        >
          <Icon className="size-4" />
          <span className="truncate">{view.name}</span>
          {!view.is_owner && view.published_department_code && (
            <span className="ml-auto shrink-0 text-[10px] font-medium text-muted-foreground">
              {view.published_department_code}
            </span>
          )}
        </SidebarMenuButton>
      </NavLink>
    </SidebarMenuItem>
  )
}

function NavItem({ item, roles }: { item: Item; roles: ReadonlyArray<string> }) {
  if (!item.visible(roles)) return null
  const Icon = item.icon
  return (
    <SidebarMenuItem>
      <NavLink to={item.to} end={item.end} className="contents">
        {({ isActive }) => (
          <SidebarMenuButton
            isActive={isActive}
            tooltip={item.label}
            className={NAV_ITEM_CLASS}
          >
            <Icon className="size-4" />
            <span>{item.label}</span>
          </SidebarMenuButton>
        )}
      </NavLink>
    </SidebarMenuItem>
  )
}

// Phase 17: Forms sidebar item — its own section (matches the mockup),
// active on an exact /forms/{id} path match so only the open form lights up.
// Draft forms (editor-only) get a hollow icon to read as not-yet-published.
function FormNavItem({ form }: { form: FormListItem }) {
  const location = useLocation()
  const isActive = location.pathname === `/forms/${form.id}`
  return (
    <SidebarMenuItem>
      <NavLink to={`/forms/${form.id}`} className="contents">
        <SidebarMenuButton
          isActive={isActive}
          tooltip={form.name}
          className={NAV_ITEM_CLASS}
        >
          <ClipboardList className="size-4" />
          <span className="truncate">{form.name}</span>
          {/* #49: pending-review count for reviewers. Active forms only (you
              can't submit to a draft), so it never collides with the draft pill. */}
          {form.pending_count > 0 && (
            <span
              className="ml-auto inline-flex min-w-4 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums"
              style={{
                backgroundColor: "hsl(var(--tone-amber-bg))",
                color: "hsl(var(--tone-amber-fg))",
              }}
              aria-label={`${form.pending_count} submission${form.pending_count === 1 ? "" : "s"} awaiting review`}
              title={`${form.pending_count} awaiting review`}
            >
              {form.pending_count}
            </span>
          )}
          {form.status === "draft" && (
            <span className="ml-auto text-[10px] uppercase tracking-wide text-[hsl(var(--subtle-fg))]">
              draft
            </span>
          )}
        </SidebarMenuButton>
      </NavLink>
    </SidebarMenuItem>
  )
}

export function AppLayout() {
  const { data: user } = useAuth()
  const logout = useLogout()
  const [theme, setTheme] = useTheme()
  const [density, setDensity] = useDensity()
  // 5.1: Saved Views — one entry per template the user can access.
  // Uses the admin templates endpoint; viewers without admin access
  // will see an empty list (handled gracefully below).
  const savedViewTemplates = useTemplateList()
  // 7.3: custom views — user-composed pages under the same group.
  const customViews = useViews()
  const createView = useViewCreate()
  // Phase 17: Forms — its own sidebar section (active forms for everyone,
  // plus drafts for editors, per the dept-scoped list endpoint).
  const forms = useFormList()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useLocalStorage<boolean>(
    "tracker.sidebarCollapsed",
    false,
  )
  const palette = useCommandPalette()
  const [paletteQuery, setPaletteQuery] = useState("")
  useGShortcuts()
  const roles = user?.roles ?? []
  const email = user?.email ?? ""

  return (
    <TopbarProvider>
    <SidebarProvider open={!collapsed} onOpenChange={(open) => setCollapsed(!open)}>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2 py-1">
            {/* Brand mark: 22×22 indigo box with "T". Matches the design's
                `.sb-brand-mark` from the design reference. */}
            <span
              aria-hidden
              className="grid size-[22px] shrink-0 place-items-center rounded-md bg-primary text-primary-foreground text-[12px] font-bold shadow-[inset_0_1px_0_rgb(255_255_255_/_0.25)]"
            >
              T
            </span>
            <span className="text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
              Tracker
            </span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {TOP_ITEMS.map((item) => (
                  <NavItem key={item.to} item={item} roles={roles} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* 5.1: Saved Views — one link per template the caller can
              access. Hidden in collapsed mode to avoid stranded labels.
              7.3: also lists the user's custom views and a "+ New view"
              button; the group now renders unconditionally so that
              affordance is always reachable. */}
          <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <div className="flex items-center justify-between pr-1">
              <SidebarGroupLabel>Saved Views</SidebarGroupLabel>
              <button
                type="button"
                aria-label="New view"
                disabled={createView.isPending}
                onClick={() =>
                  createView.mutate(
                    { name: "Untitled view" },
                    {
                      onSuccess: (v) => navigate(`/views/${v.id}`),
                      onError: (e) =>
                        toast.error(
                          e instanceof ApiError ? e.detail : "Create failed",
                        ),
                    },
                  )
                }
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
            <SidebarGroupContent>
              <SidebarMenu>
                {(savedViewTemplates.data?.items ?? []).map((t) => (
                  <SavedViewItem
                    key={t.id}
                    label={t.name}
                    templateId={t.id}
                  />
                ))}
                {(customViews.data?.items ?? []).map((v) => (
                  <CustomViewItem key={v.id} view={v} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* Phase 17: Forms — its own section mirroring the mockup. Lists
              the dept-scoped forms; the "+" (editors only) jumps to the
              Forms index where the New-form dialog lives. */}
          <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <div className="flex items-center justify-between pr-1">
              {/* The label links to the Forms index so everyone has a way there. */}
              <SidebarGroupLabel asChild>
                <NavLink to="/forms" className="hover:text-foreground transition-colors">
                  Forms
                </NavLink>
              </SidebarGroupLabel>
              {hasRole(roles, "project_editor") && (
                <button
                  type="button"
                  aria-label="New form"
                  onClick={() => navigate("/forms")}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Plus className="size-3.5" />
                </button>
              )}
            </div>
            <SidebarGroupContent>
              <SidebarMenu>
                {(forms.data?.items ?? []).map((f) => (
                  <FormNavItem key={f.id} form={f} />
                ))}
                {(forms.data?.items ?? []).length === 0 && (
                  <p className="px-2 py-1 text-xs text-muted-foreground">
                    No forms yet.
                  </p>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup className="mt-auto">
            <SidebarGroupContent>
              <SidebarMenu>
                {BOTTOM_ITEMS.map((item) => (
                  <NavItem key={item.to} item={item} roles={roles} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Open user menu"
              className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-muted group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                {initialsOf(email)}
              </div>
              <span className="flex-1 truncate text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                {email}
              </span>
              <MoreHorizontal className="size-4 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {/* Theme toggle lives in the Topbar (always visible) — no
                  duplicate here. */}
              <DropdownMenuItem
                onClick={() =>
                  setDensity(density === "compact" ? "comfortable" : "compact")
                }
              >
                <Rows3 className="size-4" />
                {density === "compact" ? "Comfortable rows" : "Compact rows"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => logout.mutate()}
                disabled={logout.isPending}
              >
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>
      <main className="flex min-w-0 flex-1 flex-col">
        <Topbar
          theme={theme}
          setTheme={setTheme}
          onOpenPalette={() => palette.setOpen(true)}
        />
        <div className="flex-1 min-h-0 overflow-auto">
          <Outlet />
        </div>
      </main>
      <CommandPalette
        open={palette.open}
        onOpenChange={palette.setOpen}
        theme={theme}
        setTheme={setTheme}
        density={density}
        setDensity={setDensity}
        query={paletteQuery}
        onQueryChange={setPaletteQuery}
      />
    </SidebarProvider>
    </TopbarProvider>
  )
}
