import { zodResolver } from "@hookform/resolvers/zod"
import { Trash2 } from "lucide-react"
import { useEffect } from "react"
import { type Resolver, useFieldArray, useForm } from "react-hook-form"
import { z } from "zod"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
  SelectGroup,
  SelectItem,
  SelectLabel,
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
  type FieldDef,
  useFieldDefCreate,
  useFieldDefUpdate,
} from "@/api/templates"
import { FIELD_TYPES, GROUPS, isSelectType } from "@/lib/field-types"

const choiceSchema = z.object({ value: z.string().min(1, "Required") })

const formSchema = z
  .object({
    name: z.string().min(1, "Name is required").max(200, "Max 200 characters"),
    field_type: z.string().min(1, "Type is required"),
    required: z.boolean(),
    is_project_metric: z.boolean(),
    choices: z.array(choiceSchema),
  })
  .superRefine((data, ctx) => {
    if (isSelectType(data.field_type)) {
      if (data.choices.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "At least one choice is required",
          path: ["choices"],
        })
      }
    }
  })

type FormValues = z.infer<typeof formSchema>

type Props = {
  tid: string
  open: boolean
  onOpenChange: (open: boolean) => void
  item?: FieldDef | null
  onSuccess?: () => void
}

export function FieldDefSheet({
  tid,
  open,
  onOpenChange,
  item,
  onSuccess,
}: Props) {
  const isEdit = !!item
  const create = useFieldDefCreate(tid)
  const update = useFieldDefUpdate(tid)
  const submitting = create.isPending || update.isPending
  const error =
    (create.error instanceof ApiError && create.error) ||
    (update.error instanceof ApiError && update.error) ||
    null

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as Resolver<FormValues>,
    defaultValues: {
      name: "",
      field_type: "short_text",
      required: false,
      is_project_metric: false,
      choices: [],
    },
  })

  const { fields: choiceFields, append, remove } = useFieldArray({
    control: form.control,
    name: "choices",
  })

  const fieldType = form.watch("field_type")
  const showOptions = isSelectType(fieldType)

  useEffect(() => {
    if (open) {
      if (item) {
        form.reset({
          name: item.name,
          field_type: item.field_type,
          required: item.required,
          is_project_metric: item.is_project_metric,
          choices:
            item.options?.choices?.map((c) => ({ value: c })) ?? [],
        })
      } else {
        form.reset({
          name: "",
          field_type: "short_text",
          required: false,
          is_project_metric: false,
          choices: [],
        })
      }
      create.reset()
      update.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id])

  // When type leaves select range, drop choices. When it enters select range
  // from empty, seed with one empty choice for the user to fill.
  useEffect(() => {
    if (!showOptions && choiceFields.length > 0) {
      form.setValue("choices", [])
    } else if (showOptions && choiceFields.length === 0) {
      form.setValue("choices", [{ value: "" }])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldType])

  const onSubmit = (values: FormValues) => {
    // order_index is omitted: backend auto-assigns on create; reorder
    // endpoint owns reorder. Existing rows preserve their order on edit.
    const body = {
      name: values.name,
      field_type: values.field_type,
      required: values.required,
      is_project_metric: values.is_project_metric,
      order_index: item?.order_index ?? 0,
      options: isSelectType(values.field_type)
        ? { choices: values.choices.map((c) => c.value) }
        : null,
    }
    if (isEdit && item) {
      update.mutate(
        { id: item.id, body },
        {
          onSuccess: () => {
            onOpenChange(false)
            onSuccess?.()
          },
        },
      )
    } else {
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
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit field" : "New field"}</SheetTitle>
          <SheetDescription>
            Defines one custom field on every project using this template.
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
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Project Description"
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
              name="field_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {GROUPS.map((group) => (
                        <SelectGroup key={group}>
                          <SelectLabel>{group}</SelectLabel>
                          {FIELD_TYPES.filter((t) => t.group === group).map(
                            (t) => (
                              <SelectItem key={t.value} value={t.value}>
                                {t.label}
                              </SelectItem>
                            ),
                          )}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {showOptions && (
              <div>
                <FormLabel>Choices</FormLabel>
                <div className="mt-2 space-y-2">
                  {choiceFields.map((cf, idx) => (
                    <div key={cf.id} className="flex items-center gap-2">
                      <FormField
                        control={form.control}
                        name={`choices.${idx}.value`}
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormControl>
                              <Input
                                {...field}
                                placeholder={`Choice ${idx + 1}`}
                                autoComplete="off"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove choice ${idx + 1}`}
                        onClick={() => remove(idx)}
                        disabled={choiceFields.length <= 1}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                  {form.formState.errors.choices?.message && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.choices.message as string}
                    </p>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => append({ value: "" })}
                  >
                    Add choice
                  </Button>
                </div>
              </div>
            )}
            <FormField
              control={form.control}
              name="required"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-2 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      id="field-required"
                    />
                  </FormControl>
                  <FormLabel htmlFor="field-required" className="!m-0">
                    Required on every project
                  </FormLabel>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="is_project_metric"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <div className="flex flex-row items-center gap-2 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        id="field-is-project-metric"
                      />
                    </FormControl>
                    <FormLabel
                      htmlFor="field-is-project-metric"
                      className="!m-0"
                    >
                      Project Metric
                    </FormLabel>
                  </div>
                  <p className="ml-6 text-xs text-muted-foreground">
                    Surfaces this field's value in the project peek
                    panel and detail sidebar so it's visible without
                    opening the Custom fields panel.
                  </p>
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
                    : "Create field"}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  )
}
