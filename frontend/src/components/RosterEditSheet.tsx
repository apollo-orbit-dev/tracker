import { zodResolver } from "@hookform/resolvers/zod"
import { useEffect } from "react"
import { type Resolver, useForm } from "react-hook-form"
import { z } from "zod"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { ApiError } from "@/api/auth"
import { type RosterEntry, useRoleUpdate } from "@/api/roster"

const ROLE_OPTIONS = [
  { value: "department_manager", label: "Department Manager" },
  { value: "project_editor", label: "Project Editor" },
  { value: "viewer", label: "Viewer" },
] as const

const schema = z.object({
  role_id: z.enum(["department_manager", "project_editor", "viewer"]),
})

type FormValues = z.infer<typeof schema>

type Props = {
  deptId: string
  entry: RosterEntry | null
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function RosterEditSheet({
  deptId,
  entry,
  onOpenChange,
  onSuccess,
}: Props) {
  const open = entry !== null
  const update = useRoleUpdate(deptId)
  const error = update.error instanceof ApiError ? update.error : null

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as Resolver<FormValues>,
    defaultValues: { role_id: "viewer" },
  })

  useEffect(() => {
    if (open && entry) {
      form.reset({
        role_id: entry.role_id as FormValues["role_id"],
      })
      update.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entry?.user_role_id])

  const onSubmit = (values: FormValues) => {
    if (!entry) return
    update.mutate(
      { userRoleId: entry.user_role_id, body: values },
      {
        onSuccess: () => {
          onOpenChange(false)
          onSuccess?.()
        },
      },
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit role</SheetTitle>
          <SheetDescription>
            {entry && (
              <>
                Change <strong>{entry.display_name}</strong>'s role in this
                department. If they already hold the target role here, you'll
                get a 409 — revoke one of the two instead.
              </>
            )}
          </SheetDescription>
        </SheetHeader>
        {error && (
          <div className="px-4">
            <Alert variant="destructive">
              <AlertTitle>Update failed</AlertTitle>
              <AlertDescription>{error.detail}</AlertDescription>
            </Alert>
          </div>
        )}
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            noValidate
            className="space-y-4 px-4 pb-4"
          >
            <FormField
              control={form.control}
              name="role_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ROLE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <SheetFooter>
              <Button type="submit" disabled={update.isPending}>
                {update.isPending ? "Saving…" : "Save changes"}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  )
}
