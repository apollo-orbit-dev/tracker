import {
  BookUser,
  CalendarDays,
  Folders,
  LayoutDashboard,
  Moon,
  Plus,
  Rows3,
  Settings2,
  Shield,
  SquareDashedKanban,
  Sun,
  Users,
} from "lucide-react"
import { useMemo } from "react"
import { useNavigate } from "react-router"
import { toast } from "sonner"

import { ApiError } from "@/api/auth"
import { useViewCreate, useViews } from "@/api/views"

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { useAuth } from "@/hooks/useAuth"
import { useDebouncedValue } from "@/hooks/useDebouncedValue"
import type { Density } from "@/hooks/useDensity"
import type { Theme } from "@/hooks/useTheme"
import { useProjectList } from "@/api/projects"
import { hasRole } from "@/lib/roles"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  theme: Theme
  setTheme: (next: Theme) => void
  density: Density
  setDensity: (next: Density) => void
  /** Query string (raw, undebounced); palette manages its own internal state. */
  query: string
  onQueryChange: (next: string) => void
}

/**
 * Phase 4.6 command palette. Three groups:
 *   - Navigate — jump to a top-level surface (gated by role for Admin)
 *   - Preferences — toggle theme / density
 *   - Projects — live server-side search via `/api/projects?q=…`,
 *     debounced 250ms so we don't fire per-keystroke
 *
 * The shadcn `Command` is a thin wrapper around cmdk, which already
 * handles arrow-key navigation, Enter selection, and search filtering
 * for built-in items. We only do the dance for the Projects group
 * because we want server-side filtering, not cmdk's built-in client
 * filter.
 */
export function CommandPalette({
  open,
  onOpenChange,
  theme,
  setTheme,
  density,
  setDensity,
  query,
  onQueryChange,
}: Props) {
  const navigate = useNavigate()
  const { data: user } = useAuth()
  const roles = user?.roles ?? []
  const isDM = hasRole(roles, "department_manager")
  const canCreateProject = hasRole(roles, "project_editor")

  const debouncedQuery = useDebouncedValue(query.trim(), 250)
  const showProjects = debouncedQuery.length > 0
  const projects = useProjectList(
    showProjects ? { q: debouncedQuery, page_size: 8 } : {},
  )

  const projectItems = useMemo(
    () => (showProjects ? projects.data?.items ?? [] : []),
    [showProjects, projects.data],
  )

  // cmdk filters built-in CommandItems by matching the input against the
  // item's text. For built-ins that works great. For Project rows we
  // already filtered server-side, so we pass `value` ourselves to make
  // sure every project row passes cmdk's filter regardless of its label.
  // The trick: prefix the value with the query, so cmdk's own
  // `includes`-style filter always matches.
  const projectFilterKey = (id: string) => `project-${id}-${debouncedQuery}`

  // Saved (custom) views — owned + shared. cmdk filters built-in items
  // by label, so the query-suffix trick used for Projects isn't strictly
  // needed here (these are real labels), but we mirror it so a query
  // always lets a view through regardless of label casing.
  const views = useViews()
  const viewItems = views.data?.items ?? []
  const viewFilterKey = (id: string) => `view-${id}-${query.trim()}`
  const createView = useViewCreate()

  const close = () => onOpenChange(false)

  const go = (path: string) => {
    close()
    navigate(path)
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command menu"
      description="Search projects or run a command"
      // cmdk's built-in filter will hide built-in items whose label
      // doesn't fuzzy-match the query, which is exactly what we want for
      // Navigate + Preferences. We override the filter only for the
      // Projects items (see the `value` prop on those CommandItems).
    >
      <CommandInput
        placeholder="Search projects or type a command…"
        value={query}
        onValueChange={onQueryChange}
      />
      <CommandList>
        <CommandEmpty>
          {showProjects && projects.isLoading
            ? "Searching…"
            : `No results for "${query}".`}
        </CommandEmpty>

        <CommandGroup heading="Navigate">
          <CommandItem
            value="navigate dashboard"
            onSelect={() => go("/")}
          >
            <LayoutDashboard className="size-4" />
            <span>Dashboard</span>
          </CommandItem>
          <CommandItem
            value="navigate projects"
            onSelect={() => go("/projects")}
          >
            <Folders className="size-4" />
            <span>Projects</span>
          </CommandItem>
          <CommandItem
            value="navigate calendar"
            onSelect={() => go("/calendar")}
          >
            <CalendarDays className="size-4" />
            <span>Calendar</span>
          </CommandItem>
          {isDM && (
            <CommandItem
              value="navigate admin"
              onSelect={() => go("/admin")}
            >
              <Shield className="size-4" />
              <span>Admin</span>
            </CommandItem>
          )}
          <CommandItem
            value="navigate settings"
            onSelect={() => go("/settings")}
          >
            <Settings2 className="size-4" />
            <span>Settings</span>
          </CommandItem>
        </CommandGroup>

        <CommandGroup heading="Actions">
          {canCreateProject && (
            <CommandItem
              value="actions new project"
              onSelect={() => go("/projects?new=1")}
            >
              <Plus className="size-4" />
              <span>New project</span>
            </CommandItem>
          )}
          <CommandItem
            value="actions new view"
            disabled={createView.isPending}
            onSelect={() =>
              createView.mutate(
                { name: "Untitled view" },
                {
                  onSuccess: (v) => go(`/views/${v.id}`),
                  onError: (e) =>
                    toast.error(
                      e instanceof ApiError ? e.detail : "Create failed",
                    ),
                },
              )
            }
          >
            <Plus className="size-4" />
            <span>New view</span>
          </CommandItem>
        </CommandGroup>

        <CommandGroup heading="Preferences">
          <CommandItem
            value="preferences theme toggle"
            onSelect={() => {
              setTheme(theme === "dark" ? "light" : "dark")
              close()
            }}
          >
            {theme === "dark" ? (
              <Sun className="size-4" />
            ) : (
              <Moon className="size-4" />
            )}
            <span>
              Switch to {theme === "dark" ? "light" : "dark"} theme
            </span>
          </CommandItem>
          <CommandItem
            value="preferences density toggle"
            onSelect={() => {
              setDensity(density === "compact" ? "comfortable" : "compact")
              close()
            }}
          >
            <Rows3 className="size-4" />
            <span>
              {density === "compact" ? "Comfortable" : "Compact"} density
            </span>
          </CommandItem>
        </CommandGroup>

        {viewItems.length > 0 && (
          <CommandGroup heading="Saved Views">
            {viewItems.map((v) => (
              <CommandItem
                key={v.id}
                value={viewFilterKey(v.id)}
                onSelect={() => go(`/views/${v.id}`)}
              >
                {v.is_owner ? (
                  <SquareDashedKanban className="size-4" />
                ) : (
                  <Users className="size-4" />
                )}
                <span className="truncate">{v.name}</span>
                {!v.is_owner && v.published_department_code && (
                  <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                    {v.published_department_code}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {showProjects && projectItems.length > 0 && (
          <CommandGroup heading="Projects">
            {projectItems.map((p) => (
              <CommandItem
                key={p.id}
                value={projectFilterKey(p.id)}
                onSelect={() => go(`/projects/${p.id}`)}
              >
                <BookUser className="size-4" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{p.title}</span>
                  {(p.project_number || p.template_intersection) && (
                    <span className="truncate font-mono text-[11px] text-muted-foreground">
                      {p.project_number || "—"}
                      {p.template_intersection
                        ? ` · ${p.template_intersection}`
                        : ""}
                    </span>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  )
}
