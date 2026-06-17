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
import {
  type Project,
  useProjectCreate,
  useProjectUpdate,
} from "@/api/projects"
import { useTemplateList } from "@/api/templates"

const createSchema = z.object({
  project_number: z
    .string()
    .min(4, "At least 4 characters")
    .max(32, "Max 32 characters")
    .regex(/^\S+$/, "No whitespace allowed"),
  client_project_number: z.string().max(64, "Max 64 characters").optional(),
  title: z.string().min(1, "Title is required").max(200, "Max 200 characters"),
  template_id: z.string().uuid("Select a template"),
})

const editSchema = z.object({
  project_number: z
    .string()
    .min(4, "At least 4 characters")
    .max(32, "Max 32 characters")
    .regex(/^\S+$/, "No whitespace allowed"),
  client_project_number: z.string().max(64, "Max 64 characters").optional(),
  title: z.string().min(1, "Title is required").max(200, "Max 200 characters"),
})

type CreateValues = z.infer<typeof createSchema>
type EditValues = z.infer<typeof editSchema>

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  item?: Project | null
  onSuccess?: () => void
}

export function ProjectSheet({ open, onOpenChange, item, onSuccess }: Props) {
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
  const create = useProjectCreate()
  const templates = useTemplateList()
  const error = create.error instanceof ApiError ? create.error : null

  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema) as Resolver<CreateValues>,
    defaultValues: {
      project_number: "",
      client_project_number: "",
      title: "",
      template_id: "",
    },
  })

  useEffect(() => {
    if (open) {
      form.reset({
        project_number: "",
        client_project_number: "",
        title: "",
        template_id: "",
      })
      create.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const onSubmit = (values: CreateValues) => {
    create.mutate(
      {
        project_number: values.project_number,
        client_project_number: values.client_project_number || null,
        title: values.title,
        template_id: values.template_id,
      },
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
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>New project</SheetTitle>
          <SheetDescription>
            A project starts in draft. Custom field values and milestone
            dates are filled in on the detail page.
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
                <AlertTitle>Create failed</AlertTitle>
                <AlertDescription>{error.detail}</AlertDescription>
              </Alert>
            )}
            <FormField
              control={form.control}
              name="project_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project number</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="25756601"
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
              name="client_project_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Client project number (optional)</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Rollout — Phase 1"
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
              name="template_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Template</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            templates.isLoading
                              ? "Loading…"
                              : "Select a template"
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(templates.data?.items ?? []).map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
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
                disabled={create.isPending || templates.isLoading}
              >
                {create.isPending ? "Creating…" : "Create project"}
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
  item: Project
  onSuccess?: () => void
}) {
  const update = useProjectUpdate()
  const error = update.error instanceof ApiError ? update.error : null

  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema) as Resolver<EditValues>,
    defaultValues: {
      project_number: item.project_number,
      client_project_number: item.client_project_number ?? "",
      title: item.title,
    },
  })

  useEffect(() => {
    if (open) {
      form.reset({
        project_number: item.project_number,
        client_project_number: item.client_project_number ?? "",
        title: item.title,
      })
      update.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item.id])

  const onSubmit = (values: EditValues) => {
    update.mutate(
      {
        id: item.id,
        body: {
          project_number: values.project_number,
          client_project_number: values.client_project_number || null,
          title: values.title,
        },
      },
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
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit project</SheetTitle>
          <SheetDescription>
            Update number, title, or client number. Template is fixed.
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
              name="project_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project number</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="client_project_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Client project number (optional)</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
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
