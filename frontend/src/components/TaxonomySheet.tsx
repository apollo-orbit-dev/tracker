import { zodResolver } from "@hookform/resolvers/zod"
import { useEffect } from "react"
import { type Resolver, useForm } from "react-hook-form"
import { z } from "zod"

import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
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
import {
  isDeptScoped,
  type TaxonomyItem,
  type TaxonomyPath,
  useTaxonomyCreate,
  useTaxonomyUpdate,
} from "@/api/taxonomy"

const baseSchema = {
  code: z
    .string()
    .min(1, "Code is required")
    .max(32, "Max 32 characters")
    .regex(/^\S+$/, "No whitespace allowed"),
  name: z.string().min(1, "Name is required").max(200, "Max 200 characters"),
}

const orgSchema = z.object(baseSchema)
const deptSchema = z.object({
  ...baseSchema,
  department_id: z.string().uuid("Department is required"),
})

// Per-taxonomy placeholder hints. Departments and disciplines get the
// canonical example; clients are open-ended so we leave the hint blank.
const PLACEHOLDERS: Record<TaxonomyPath, { code: string; name: string }> = {
  departments: { code: "DIV1", name: "Division 1" },
  clients: { code: "", name: "" },
  disciplines: { code: "Design", name: "Protection & Controls" },
}

type Props = {
  path: TaxonomyPath
  singular: string
  open: boolean
  onOpenChange: (open: boolean) => void
  item?: TaxonomyItem | null
  onSuccess?: () => void
}

export function TaxonomySheet({
  path,
  singular,
  open,
  onOpenChange,
  item,
  onSuccess,
}: Props) {
  const isEdit = !!item
  const scoped = isDeptScoped(path)
  const placeholders = PLACEHOLDERS[path]
  const create = useTaxonomyCreate(path)
  const update = useTaxonomyUpdate(path)
  const departments = useMyDepartments()
  const submitting = create.isPending || update.isPending
  const error =
    (create.error instanceof ApiError && create.error) ||
    (update.error instanceof ApiError && update.error) ||
    null

  type FormValues = {
    code: string
    name: string
    department_id?: string
  }

  const formSchema = scoped ? deptSchema : orgSchema
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as Resolver<FormValues>,
    defaultValues: { code: "", name: "", department_id: "" },
  })

  useEffect(() => {
    if (open) {
      form.reset(
        item
          ? {
              code: item.code,
              name: item.name,
              department_id: item.department_id ?? "",
            }
          : { code: "", name: "", department_id: "" },
      )
      create.reset()
      update.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id])

  const onSubmit = (values: FormValues) => {
    if (isEdit && item) {
      update.mutate(
        { id: item.id, body: { code: values.code, name: values.name } },
        {
          onSuccess: () => {
            onOpenChange(false)
            onSuccess?.()
          },
        },
      )
    } else {
      const body =
        scoped && values.department_id
          ? {
              code: values.code,
              name: values.name,
              department_id: values.department_id,
            }
          : { code: values.code, name: values.name }
      create.mutate(body, {
        onSuccess: () => {
          onOpenChange(false)
          onSuccess?.()
        },
      })
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>
            {isEdit ? `Edit ${singular}` : `New ${singular}`}
          </SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Update the record's code or name."
              : `Create a new ${singular.toLowerCase()} record.`}
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
                <AlertTitle>
                  {isEdit ? "Update failed" : "Create failed"}
                </AlertTitle>
                <AlertDescription>{error.detail}</AlertDescription>
              </Alert>
            )}
            {scoped && (
              <FormField
                control={form.control}
                name="department_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Department</FormLabel>
                    <Select
                      value={field.value ?? ""}
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
            )}
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Code</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={placeholders.code}
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
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={placeholders.name}
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
                    : `Create ${singular.toLowerCase()}`}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  )
}
