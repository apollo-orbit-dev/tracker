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
  type MilestoneDef,
  useMilestoneDefCreate,
  useMilestoneDefUpdate,
} from "@/api/templates"
import {
  MILESTONE_DATE_MODELS,
  MILESTONE_DIRECTIONS,
} from "@/lib/field-types"

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(200, "Max 200 characters"),
  direction: z.string().min(1, "Required"),
  date_model: z.string().min(1, "Required"),
})

type FormValues = z.infer<typeof formSchema>

type Props = {
  tid: string
  open: boolean
  onOpenChange: (open: boolean) => void
  item?: MilestoneDef | null
  onSuccess?: () => void
}

export function MilestoneDefSheet({
  tid,
  open,
  onOpenChange,
  item,
  onSuccess,
}: Props) {
  const isEdit = !!item
  const create = useMilestoneDefCreate(tid)
  const update = useMilestoneDefUpdate(tid)
  const submitting = create.isPending || update.isPending
  const error =
    (create.error instanceof ApiError && create.error) ||
    (update.error instanceof ApiError && update.error) ||
    null

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as Resolver<FormValues>,
    defaultValues: {
      name: "",
      direction: "outbound",
      date_model: "single",
    },
  })

  useEffect(() => {
    if (open) {
      if (item) {
        form.reset({
          name: item.name,
          direction: item.direction,
          date_model: item.date_model,
        })
      } else {
        form.reset({
          name: "",
          direction: "outbound",
          date_model: "single",
        })
      }
      create.reset()
      update.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id])

  const onSubmit = (values: FormValues) => {
    // order_index is managed by backend on create and by the reorder
    // endpoint thereafter; we preserve the existing value on edit.
    const body = { ...values, order_index: item?.order_index ?? 0 }
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
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit milestone" : "New milestone"}</SheetTitle>
          <SheetDescription>
            Defines a milestone that auto-creates on every project using this template.
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
                      placeholder="IFC Submittal"
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
              name="direction"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Direction</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {MILESTONE_DIRECTIONS.map((d) => (
                        <SelectItem key={d.value} value={d.value}>
                          {d.label}
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
              name="date_model"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date model</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {MILESTONE_DATE_MODELS.map((d) => (
                        <SelectItem key={d.value} value={d.value}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                    : "Create milestone"}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  )
}
