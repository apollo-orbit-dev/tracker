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
import { UserCombobox } from "@/components/UserCombobox"
import { ApiError } from "@/api/auth"
import { useRoleGrant, useUserPicker } from "@/api/roster"

const ROLE_OPTIONS = [
  { value: "department_manager", label: "Department Manager" },
  { value: "project_editor", label: "Project Editor" },
  { value: "viewer", label: "Viewer" },
] as const

const formSchema = z.object({
  user_id: z.string().uuid("Pick a user"),
  role_id: z.enum(["department_manager", "project_editor", "viewer"]),
})

type FormValues = z.infer<typeof formSchema>

type Props = {
  deptId: string
  deptLabel: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function RosterAddSheet({
  deptId,
  deptLabel,
  open,
  onOpenChange,
  onSuccess,
}: Props) {
  const grant = useRoleGrant(deptId)
  const picker = useUserPicker()
  const error = grant.error instanceof ApiError ? grant.error : null

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as Resolver<FormValues>,
    defaultValues: { user_id: "", role_id: "viewer" },
  })

  useEffect(() => {
    if (open) {
      form.reset({ user_id: "", role_id: "viewer" })
      grant.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const onSubmit = (values: FormValues) => {
    grant.mutate(values, {
      onSuccess: () => {
        onOpenChange(false)
        onSuccess?.()
      },
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Add to {deptLabel} roster</SheetTitle>
          <SheetDescription>
            Grant a user a role in this department. A user can hold multiple
            roles across departments; the same role can't be granted twice in
            the same department.
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            noValidate
            className="space-y-4 px-4 pb-4"
          >
            {error && (
              <Alert variant="destructive">
                <AlertTitle>Grant failed</AlertTitle>
                <AlertDescription>{error.detail}</AlertDescription>
              </Alert>
            )}
            <FormField
              control={form.control}
              name="user_id"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>User</FormLabel>
                  <FormControl>
                    <UserCombobox
                      users={picker.data?.items ?? []}
                      value={field.value}
                      onChange={field.onChange}
                      isLoading={picker.isLoading}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a role" />
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
              <Button type="submit" disabled={grant.isPending}>
                {grant.isPending ? "Granting…" : "Grant role"}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  )
}
