import type { ReactNode } from "react"
import { Link } from "react-router"

import { SidebarTrigger } from "@/components/ui/sidebar"

export type Crumb = { label: string; to: string }

type Props = {
  title: string
  crumbs?: ReadonlyArray<Crumb>
  actions?: ReactNode
}

export function PageHeader({ title, crumbs, actions }: Props) {
  return (
    <header className="sticky top-0 z-10 border-b bg-background">
      <div className="flex items-center gap-3 px-6 py-3">
        <SidebarTrigger className="md:hidden" />
        <div className="flex-1 min-w-0">
          {crumbs && crumbs.length > 0 && (
            <nav className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
              {crumbs.map((c, i) => (
                <span key={c.to} className="flex items-center gap-2">
                  {i > 0 && <span>/</span>}
                  <Link to={c.to} className="hover:underline">
                    {c.label}
                  </Link>
                </span>
              ))}
            </nav>
          )}
          <h1 className="truncate text-xl font-semibold">{title}</h1>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}
