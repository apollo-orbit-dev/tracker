import { Bell, ChevronRight, Moon, Search, Sun } from "lucide-react"
import { Link } from "react-router"

import { useTopbarContext } from "@/components/topbar/TopbarContext"
import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { Theme } from "@/hooks/useTheme"

/**
 * Phase 4.1 top bar. Sits above the routed page content. Cmd+K trigger
 * was wired up in Phase 4.6; notifications icon is still a placeholder.
 */
type Props = {
  theme: Theme
  setTheme: (next: Theme) => void
  onOpenPalette: () => void
}

/** True on macOS — used to render the cmd+K / ctrl+K hint correctly. */
function isMac(): boolean {
  if (typeof navigator === "undefined") return false
  const platform =
    (navigator as { userAgentData?: { platform?: string } }).userAgentData
      ?.platform || navigator.platform
  return /mac/i.test(platform)
}

export function Topbar({ theme, setTheme, onOpenPalette }: Props) {
  const mac = isMac()
  const { crumbs } = useTopbarContext()
  return (
    <header className="sticky top-0 z-40 flex h-[52px] shrink-0 items-center gap-2 border-b bg-background px-3">
      <SidebarTrigger />
      {crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
          {crumbs.map((c, i) => (
            <span key={`${c.label}-${i}`} className="flex items-center gap-1.5 min-w-0">
              {i > 0 && (
                <ChevronRight
                  aria-hidden
                  className="size-3.5 shrink-0 text-muted-foreground/60"
                />
              )}
              {c.to && i < crumbs.length - 1 ? (
                <Link
                  to={c.to}
                  className="truncate text-muted-foreground hover:text-foreground"
                >
                  {c.label}
                </Link>
              ) : (
                <span
                  aria-current={i === crumbs.length - 1 ? "page" : undefined}
                  className="truncate font-medium"
                >
                  {c.label}
                </span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex-1" />
      <button
        type="button"
        onClick={onOpenPalette}
        aria-label="Search or run a command"
        className="hidden h-8 min-w-[210px] items-center gap-2 rounded-md border px-2.5 text-xs text-muted-foreground hover:border-foreground/30 hover:bg-muted/50 sm:flex"
      >
        <Search className="size-3.5" />
        <span className="flex-1 text-left">Search or run a command</span>
        <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] leading-none">
          {mac ? "⌘ K" : "Ctrl K"}
        </kbd>
      </button>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label={
              theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
            }
          >
            {theme === "dark" ? (
              <Sun className="size-4" />
            ) : (
              <Moon className="size-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {theme === "dark" ? "Light theme" : "Dark theme"}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled
            aria-label="Notifications (coming soon)"
          >
            <Bell className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Notifications</TooltipContent>
      </Tooltip>
    </header>
  )
}
