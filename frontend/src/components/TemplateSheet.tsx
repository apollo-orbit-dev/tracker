import { zodResolver } from "@hookform/resolvers/zod"
import { useEffect } from "react"
import { useForm } from "react-hook-form"
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
import { useMyDepartments } from "@/api/me"
import { useTaxonomyList } from "@/api/taxonomy"
import {
  type Template,
  useTemplateCreate,
  useTemplateUpdate,
} from "@/api/templates"

const createSchema = z.object({
  name: z.string().min(1, "Name is required").max(200, "Max 200 characters"),
  department_id: z.string().uuid("Select a department"),
  client_id: z.string().uuid("Select a client"),
  discipline_id: z.string().uuid("Select a discipline"),
})

const editSchema = z.object({
  name: z.string().min(1, "Name is required").max(200, "Max 200 characters"),
})

type CreateValues = z.infer<typeof createSchema>
type EditValues = z.infer<typeof editSchema>

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  item?: Template | null
  onSuccess?: () => void
}

export function TemplateSheet({ open, onOpenChange, item, onSuccess }: Props) {
  const isEdit = !!item

  return isEdit ? (
    <EditSheet
      open={open}
      onOpenChange={onOpenChange}
      item={item!}
      onSuccess={onSuccess}
    />
  ) : (
    <CreateSheet
      open={open}
      onOpenChange={onOpenChange}
      onSuccess={onSuccess}
    />
  )
}

function CreateSheet({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}) {
  const create = useTemplateCreate()
  const depts = useMyDepartments()
  const clients = useTaxonomyList("clients", false)
  const disciplines = useTaxonomyList("disciplines", false)

  const taxonomiesLoading =
    depts.isLoading || clients.isLoading || disciplines.isLoading

  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      name: "",
      department_id: "",
      client_id: "",
      discipline_id: "",
    },
  })

  useEffect(() => {
    if (open) {
      form.reset({
        name: "",
        department_id: "",
        client_id: "",
        discipline_id: "",
      })
      create.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const error = create.error instanceof ApiError ? create.error : null

  const onSubmit = (values: CreateValues) => {
    create.mutate(values, {
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
          <SheetTitle>New template</SheetTitle>
          <SheetDescription>
            One template per Department × Client × Discipline.
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            noValidate
            className="space-y-4 px-4"
          >
            {error && (
              <Alert variant="destructive">
                <AlertTitle>Create failed</AlertTitle>
                <AlertDescription>{error.detail}</AlertDescription>
              </Alert>
            )}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="DIV1 / CON / Design"
                      autoComplete="off"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="department_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Department</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            taxonomiesLoading ? "Loading…" : "Select a department"
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(depts.data ?? []).map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.code} — {d.name}
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
              name="client_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Client</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            taxonomiesLoading ? "Loading…" : "Select a client"
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(clients.data?.items ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.code} — {c.name}
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
              name="discipline_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Discipline</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            taxonomiesLoading ? "Loading…" : "Select a discipline"
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(disciplines.data?.items ?? []).map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.code} — {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <SheetFooter>
              <Button
                type="submit"
                disabled={create.isPending || taxonomiesLoading}
              >
                {create.isPending ? "Creating…" : "Create template"}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  )
}

function EditSheet({
  open,
  onOpenChange,
  item,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: Template
  onSuccess?: () => void
}) {
  const update = useTemplateUpdate()

  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { name: item.name },
  })

  useEffect(() => {
    if (open) {
      form.reset({ name: item.name })
      update.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item.id])

  const error = update.error instanceof ApiError ? update.error : null

  const onSubmit = (values: EditValues) => {
    update.mutate(
      { id: item.id, body: values },
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
          <SheetTitle>Edit template</SheetTitle>
          <SheetDescription>
            Rename. Intersection (department × client × discipline) is fixed.
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            noValidate
            className="space-y-4 px-4"
          >
            {error && (
              <Alert variant="destructive">
                <AlertTitle>Update failed</AlertTitle>
                <AlertDescription>{error.detail}</AlertDescription>
              </Alert>
            )}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
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
