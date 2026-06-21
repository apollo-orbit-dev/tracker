/**
 * TargetProjectPicker — combobox for choosing the target project when
 * filling out a COR (or any form whose target_entity requires a project).
 *
 * Mirrors the Command + Popover pattern used in UserCombobox.tsx.
 */
import { Check, ChevronsUpDown, X } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { useProjectList } from "@/api/projects"

type Props = {
  value: string | null
  /** `null` clears the selection (#50). */
  onChange: (projectId: string | null) => void
}

export function TargetProjectPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)

  // Fetch a generous page so the user can search by number or title.
  const { data, isLoading } = useProjectList({ page_size: 200 })
  const projects = data?.items ?? []

  const selected = projects.find((p) => p.id === value)
  const buttonLabel = selected
    ? `${selected.project_number} — ${selected.title}`
    : "Select a project…"

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Target project"
          disabled={isLoading}
          data-testid="target-project-trigger"
          className={cn(
            "w-full justify-between font-normal",
            !selected && "text-muted-foreground",
          )}
        >
          <span className="truncate">{buttonLabel}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder="Search by number or title…" />
          <CommandList>
            <CommandEmpty>No project found.</CommandEmpty>
            {selected && (
              <CommandGroup>
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onChange(null)
                    setOpen(false)
                  }}
                  className="text-muted-foreground"
                >
                  <X className="mr-2 size-4" />
                  Clear selection
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {projects.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`${p.project_number} ${p.title}`}
                  onSelect={() => {
                    onChange(p.id)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 size-4",
                      p.id === value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="flex flex-col">
                    <span>{p.project_number}</span>
                    <span className="text-xs text-muted-foreground">
                      {p.title}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
