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
import { useContactList } from "@/api/contacts"
import {
  type ProjectContact,
  useProjectContactAttach,
  useProjectContactUpdate,
} from "@/api/project_contacts"

const createSchema = z.object({
  contact_id: z.string().uuid("Select a contact"),
  role: z.string().min(1, "Role is required").max(100, "Max 100 characters"),
})

const editSchema = z.object({
  role: z.string().min(1, "Role is required").max(100, "Max 100 characters"),
})

type CreateValues = z.infer<typeof createSchema>
type EditValues = z.infer<typeof editSchema>

type Props = {
  pid: string
  open: boolean
  onOpenChange: (open: boolean) => void
  item?: ProjectContact | null
  onSuccess?: () => void
}

export function ProjectContactSheet({
  pid,
  open,
  onOpenChange,
  item,
  onSuccess,
}: Props) {
  const isEdit = !!item
  return isEdit ? (
    <EditSheet
      pid={pid}
      open={open}
      onOpenChange={onOpenChange}
      item={item!}
      onSuccess={onSuccess}
    />
  ) : (
    <AttachSheet
      pid={pid}
      open={open}
      onOpenChange={onOpenChange}
      onSuccess={onSuccess}
    />
  )
}

function AttachSheet({
  pid,
  open,
  onOpenChange,
  onSuccess,
}: {
  pid: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}) {
  const attach = useProjectContactAttach(pid)
  const contacts = useContactList()
  const error = attach.error instanceof ApiError ? attach.error : null

  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema) as Resolver<CreateValues>,
    defaultValues: { contact_id: "", role: "" },
  })

  useEffect(() => {
    if (open) {
      form.reset({ contact_id: "", role: "" })
      attach.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const onSubmit = (values: CreateValues) => {
    attach.mutate(values, {
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
          <SheetTitle>Attach contact</SheetTitle>
          <SheetDescription>
            Pick an existing contact and label their role on this project.
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
                <AlertTitle>Attach failed</AlertTitle>
                <AlertDescription>{error.detail}</AlertDescription>
              </Alert>
            )}
            <FormField
              control={form.control}
              name="contact_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            contacts.isLoading ? "Loading…" : "Select a contact"
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(contacts.data?.items ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                          {c.organization ? ` — ${c.organization}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role on project</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Client PM"
                      autoComplete="off"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <SheetFooter>
              <Button
                type="submit"
                disabled={attach.isPending || contacts.isLoading}
              >
                {attach.isPending ? "Attaching…" : "Attach contact"}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  )
}

function EditSheet({
  pid,
  open,
  onOpenChange,
  item,
  onSuccess,
}: {
  pid: string
  open: boolean
  onOpenChange: (open: boolean) => void
  item: ProjectContact
  onSuccess?: () => void
}) {
  const update = useProjectContactUpdate(pid)
  const error = update.error instanceof ApiError ? update.error : null

  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema) as Resolver<EditValues>,
    defaultValues: { role: item.role },
  })

  useEffect(() => {
    if (open) {
      form.reset({ role: item.role })
      update.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item.id])

  const onSubmit = (values: EditValues) => {
    update.mutate(
      { id: item.id, role: values.role },
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
            {item.contact.name}'s role on this project.
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
                <AlertTitle>Update failed</AlertTitle>
                <AlertDescription>{error.detail}</AlertDescription>
              </Alert>
            )}
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role on project</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" {...field} />
                  </FormControl>
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
