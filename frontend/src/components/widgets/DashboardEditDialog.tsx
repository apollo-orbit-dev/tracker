// Reused for both "create dashboard" and "rename dashboard" — both
// are just a single name input + a save button. Caller passes the
// initial value and a save handler.
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  initialName: string
  saveLabel: string
  savingLabel: string
  saving?: boolean
  onSave: (name: string) => void
}

export function DashboardEditDialog({
  open,
  onOpenChange,
  title,
  description,
  initialName,
  saveLabel,
  savingLabel,
  saving,
  onSave,
}: Props) {
  const [name, setName] = useState(initialName)

  useEffect(() => {
    if (open) setName(initialName)
  }, [open, initialName])

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onSave(trimmed)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="dashboard-name">Name</Label>
          <Input
            id="dashboard-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            placeholder="Dashboard"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") submit()
            }}
          />
        </div>
        <DialogFooter>
          <Button type="button" onClick={submit} disabled={saving || !name.trim()}>
            {saving ? savingLabel : saveLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
