// Reusable searchable user picker.
//
// cmdk filters items by the text in `CommandItem`'s `value` prop. We
// combine display_name + email into that string so a search like "doe"
// or "jane@" both narrow correctly. The user id is closed over in the
// `onSelect` handler, so name collisions don't cause cross-talk.
import { Check, ChevronsUpDown } from "lucide-react"
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
import type { UserPickerItem } from "@/api/roster"

type Props = {
  users: UserPickerItem[]
  value: string
  onChange: (userId: string) => void
  isLoading?: boolean
  placeholder?: string
}

export function UserCombobox({
  users,
  value,
  onChange,
  isLoading,
  placeholder = "Select a user…",
}: Props) {
  const [open, setOpen] = useState(false)
  const selected = users.find((u) => u.id === value)
  const buttonLabel = selected
    ? `${selected.display_name} — ${selected.email}`
    : placeholder

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={placeholder}
          disabled={isLoading}
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
          <CommandInput placeholder="Search by name or email…" />
          <CommandList>
            <CommandEmpty>No user found.</CommandEmpty>
            <CommandGroup>
              {users.map((u) => (
                <CommandItem
                  key={u.id}
                  value={`${u.display_name} ${u.email}`}
                  onSelect={() => {
                    onChange(u.id)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 size-4",
                      u.id === value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="flex flex-col">
                    <span>{u.display_name}</span>
                    <span className="text-xs text-muted-foreground">
                      {u.email}
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
