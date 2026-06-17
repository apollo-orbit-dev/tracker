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
import { Input } from "@/components/ui/input"
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
import { type UserItem, useUserCreate, useUserUpdate } from "@/api/users"

const createSchema = z.object({
  email: z.string().email("Enter a valid email").max(200),
  display_name: z.string().min(1, "Required").max(200),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters")
    .max(200),
})

const editSchema = z.object({
  display_name: z.string().min(1, "Required").max(200),
  lifecycle_state: z.enum(["active", "deactivated", "pending"]),
})

type CreateValues = z.infer<typeof createSchema>
type EditValues = z.infer<typeof editSchema>

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  item?: UserItem | null
  onSuccess?: (msg: string) => void
}

const STATE_LABELS: Record<string, string> = {
  active: "Active",
  deactivated: "Deactivated",
  pending: "Pending",
}

export function UserSheet({ open, onOpenChange, item, onSuccess }: Props) {
  const isEdit = !!item
  const create = useUserCreate()
  const update = useUserUpdate()
  const error =
    (create.error instanceof ApiError && create.error) ||
    (update.error instanceof ApiError && update.error) ||
    null
  const submitting = create.isPending || update.isPending

  const createForm = useForm<CreateValues>({
    resolver: zodResolver(createSchema) as Resolver<CreateValues>,
    defaultValues: { email: "", display_name: "", password: "" },
  })
  const editForm = useForm<EditValues>({
    resolver: zodResolver(editSchema) as Resolver<EditValues>,
    defaultValues: { display_name: "", lifecycle_state: "active" },
  })

  useEffect(() => {
    if (open) {
      if (item) {
        editForm.reset({
          display_name: item.display_name,
          lifecycle_state:
            (item.lifecycle_state as EditValues["lifecycle_state"]) ?? "active",
        })
      } else {
        createForm.reset({ email: "", display_name: "", password: "" })
      }
      create.reset()
      update.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id])

  const onCreate = (values: CreateValues) =>
    create.mutate(values, {
      onSuccess: () => {
        onOpenChange(false)
        onSuccess?.("User created")
      },
    })

  const onEdit = (values: EditValues) => {
    if (!item) return
    update.mutate(
      { id: item.id, body: values },
      {
        onSuccess: () => {
          onOpenChange(false)
          onSuccess?.("User updated")
        },
      },
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit user" : "New user"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Edit the user's name and lifecycle state. Email and password are managed separately."
              : "Create a user with a local password. They can sign in immediately."}
          </SheetDescription>
        </SheetHeader>
        {error && (
          <div className="px-4">
            <Alert variant="destructive">
              <AlertTitle>{isEdit ? "Update failed" : "Create failed"}</AlertTitle>
              <AlertDescription>{error.detail}</AlertDescription>
            </Alert>
          </div>
        )}
        {isEdit ? (
          <Form {...editForm}>
            <form
              onSubmit={editForm.handleSubmit(onEdit)}
              noValidate
              className="space-y-4 px-4 pb-4"
            >
              <FormField
                control={editForm.control}
                name="display_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display name</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="lifecycle_state"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lifecycle</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(["active", "deactivated", "pending"] as const).map(
                          (s) => (
                            <SelectItem key={s} value={s}>
                              {STATE_LABELS[s]}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <SheetFooter>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Saving…" : "Save changes"}
                </Button>
              </SheetFooter>
            </form>
          </Form>
        ) : (
          <Form {...createForm}>
            <form
              onSubmit={createForm.handleSubmit(onCreate)}
              noValidate
              className="space-y-4 px-4 pb-4"
            >
              <FormField
                control={createForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="jane@example.com"
                        autoComplete="off"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createForm.control}
                name="display_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display name</FormLabel>
                    <FormControl>
                      <Input placeholder="Jane Doe" autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createForm.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Initial password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="new-password"
                        placeholder="At least 12 characters"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <SheetFooter>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Creating…" : "Create user"}
                </Button>
              </SheetFooter>
            </form>
          </Form>
        )}
      </SheetContent>
    </Sheet>
  )
}
