import { MoreHorizontal, Plus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Avatar } from "@/components/Avatar"
import { ProjectContactDeleteDialog } from "@/components/ProjectContactDeleteDialog"
import { ProjectContactSheet } from "@/components/ProjectContactSheet"
import { SideBlock } from "@/components/SideBlock"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  type ProjectContact,
  useProjectContactList,
} from "@/api/project_contacts"

/**
 * Phase 4.3 — compact contacts list for the project detail right sidebar.
 * Owns its own attach/edit/detach sheet + delete dialog state, mirroring
 * how the full-width `ProjectContactsCard` worked. Rendering style differs
 * (avatar + name/role rows instead of a table) to fit a 320px column.
 */
type Props = {
  pid: string
  canEdit: boolean
}

export function ContactsSideList({ pid, canEdit }: Props) {
  const list = useProjectContactList(pid)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<ProjectContact | null>(null)
  const [deleting, setDeleting] = useState<ProjectContact | null>(null)

  const items = list.data?.items ?? []

  return (
    <SideBlock
      label="Contacts"
      action={
        canEdit && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Attach contact"
            onClick={() => {
              setEditing(null)
              setSheetOpen(true)
            }}
          >
            <Plus className="size-4" />
          </Button>
        )
      }
    >
      {list.isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No contacts attached.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((pc) => (
            <li
              key={pc.id}
              className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted/60"
            >
              <Avatar name={pc.contact.name} size={28} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {pc.contact.name}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {pc.role}
                  {pc.contact.organization
                    ? ` · ${pc.contact.organization}`
                    : ""}
                </div>
              </div>
              {canEdit && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0"
                      aria-label={`Actions for ${pc.contact.name}`}
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() => {
                        setEditing(pc)
                        setSheetOpen(true)
                      }}
                    >
                      Edit role
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => setDeleting(pc)}
                    >
                      Detach
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </li>
          ))}
        </ul>
      )}

      <ProjectContactSheet
        pid={pid}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        item={editing}
        onSuccess={() =>
          toast.success(editing ? "Role updated" : "Contact attached")
        }
      />
      <ProjectContactDeleteDialog
        pid={pid}
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        item={deleting}
        onDeleted={() => toast.success("Contact detached")}
      />
    </SideBlock>
  )
}
