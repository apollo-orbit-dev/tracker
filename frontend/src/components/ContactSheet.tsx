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
  type Contact,
  useContactCreate,
  useContactUpdate,
} from "@/api/contacts"
import { useMyDepartments } from "@/api/me"

const formSchema = z.object({
  department_id: z.string().uuid("Department is required"),
  name: z.string().min(1, "Name is required").max(200, "Max 200 characters"),
  email: z
    .string()
    .max(200)
    .refine(
      (v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      "Enter a valid email or leave empty",
    )
    .optional(),
  phone: z.string().max(50).optional(),
  organization: z.string().max(200).optional(),
})

type FormValues = z.infer<typeof formSchema>

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  item?: Contact | null
  onSuccess?: () => void
}

export function ContactSheet({ open, onOpenChange, item, onSuccess }: Props) {
  const isEdit = !!item
  const create = useContactCreate()
  const update = useContactUpdate()
  const departments = useMyDepartments()
  const submitting = create.isPending || update.isPending
  const error =
    (create.error instanceof ApiError && create.error) ||
    (update.error instanceof ApiError && update.error) ||
    null

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as Resolver<FormValues>,
    defaultValues: {
      department_id: "",
      name: "",
      email: "",
      phone: "",
      organization: "",
    },
  })

  useEffect(() => {
    if (open) {
      if (item) {
        form.reset({
          department_id: item.department_id,
          name: item.name,
          email: item.email ?? "",
          phone: item.phone ?? "",
          organization: item.organization ?? "",
        })
      } else {
        form.reset({
          department_id: "",
          name: "",
          email: "",
          phone: "",
          organization: "",
        })
      }
      create.reset()
      update.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id])

  const onSubmit = (values: FormValues) => {
    const baseBody = {
      name: values.name,
      email: values.email ? values.email : null,
      phone: values.phone ? values.phone : null,
      organization: values.organization ? values.organization : null,
    }
    if (isEdit && item) {
      update.mutate(
        { id: item.id, body: baseBody },
        {
          onSuccess: () => {
            onOpenChange(false)
            onSuccess?.()
          },
        },
      )
    } else {
      create.mutate(
        { department_id: values.department_id, ...baseBody },
        {
          onSuccess: () => {
            onOpenChange(false)
            onSuccess?.()
          },
        },
      )
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit contact" : "New contact"}</SheetTitle>
          <SheetDescription>
            Contacts belong to a department. Email must be unique among live
            contacts in the same department.
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
                <AlertTitle>
                  {isEdit ? "Update failed" : "Create failed"}
                </AlertTitle>
                <AlertDescription>{error.detail}</AlertDescription>
              </Alert>
            )}
            <FormField
              control={form.control}
              name="department_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Department</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={isEdit || departments.isLoading}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a department" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(departments.data ?? []).map((d) => (
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
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Jane Doe"
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
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email (optional)</FormLabel>
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
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone (optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="555-0100"
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
              name="organization"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Organization (optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Contoso"
                      autoComplete="off"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <SheetFooter>
              <Button type="submit" disabled={submitting}>
                {submitting
                  ? isEdit
                    ? "Saving…"
                    : "Creating…"
                  : isEdit
                    ? "Save changes"
                    : "Create contact"}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  )
}
