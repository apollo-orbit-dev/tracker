import { zodResolver } from "@hookform/resolvers/zod"
import { useEffect, useState } from "react"
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
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { UserCombobox } from "@/components/UserCombobox"
import { ApiError } from "@/api/auth"
import {
  type EventSeries,
  useEventAboutUserOptions,
  useEventCreate,
  useEventUpdate,
  useOccurrenceModify,
} from "@/api/events"
import type { RecurrenceConfig } from "@/lib/recurrence"
import { RecurrenceBuilder } from "@/components/calendar/RecurrenceBuilder"

// ── Schema ────────────────────────────────────────────────────────────────────

const formSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title must be 200 characters or fewer"),
  description: z.string().max(2000, "Description must be 2000 characters or fewer").optional(),
  about_user_id: z.string().optional(),
  all_day: z.boolean(),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
})

type FormValues = z.infer<typeof formSchema>

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  departmentId: string
  /** Present = edit mode; absent = create */
  item?: EventSeries | null
  /** Present alongside item = edit this occurrence only */
  occurrenceDate?: string | null
  /** Pre-fill the start date field in create mode (ignored in edit mode) */
  initialStartDate?: string
  onSuccess?: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function EventSheet({
  open,
  onOpenChange,
  departmentId,
  item,
  occurrenceDate,
  initialStartDate,
  onSuccess,
}: Props) {
  const isEdit = !!item
  const isOccurrence = isEdit && !!occurrenceDate

  const create = useEventCreate()
  const update = useEventUpdate()
  const modifyOccurrence = useOccurrenceModify(item?.id ?? "")
  const aboutUsers = useEventAboutUserOptions(departmentId)

  const submitting = create.isPending || update.isPending || modifyOccurrence.isPending

  const errorRaw = create.error ?? update.error ?? modifyOccurrence.error
  const error = errorRaw instanceof ApiError ? errorRaw : null

  // Recurrence lives outside react-hook-form (it's a complex sub-object)
  const [recurrence, setRecurrence] = useState<RecurrenceConfig | null>(item?.recurrence ?? null)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as Resolver<FormValues>,
    defaultValues: {
      title: "",
      description: "",
      about_user_id: "",
      all_day: true,
      start_time: "",
      end_time: "",
      start_date: "",
      end_date: "",
    },
  })

  const allDay = form.watch("all_day")

  // Reset form when sheet opens or item changes
  useEffect(() => {
    if (open) {
      form.reset(
        item
          ? {
              title: item.title,
              description: item.description ?? "",
              about_user_id: item.about_user_id ?? "",
              all_day: item.all_day,
              start_time: item.start_time ?? "",
              end_time: item.end_time ?? "",
              start_date: item.start_date ?? "",
              end_date: item.end_date ?? "",
            }
          : {
              title: "",
              description: "",
              about_user_id: "",
              all_day: true,
              start_time: "",
              end_time: "",
              start_date: initialStartDate ?? "",
              end_date: "",
            },
      )
      setRecurrence(item?.recurrence ?? null)
      create.reset()
      update.reset()
      modifyOccurrence.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id, initialStartDate])

  // ── Determine title ────────────────────────────────────────────────────────

  let sheetTitle: string
  if (!isEdit) sheetTitle = "New event"
  else if (isOccurrence) sheetTitle = "Edit this occurrence"
  else sheetTitle = "Edit event series"

  let sheetDescription: string
  if (!isEdit) sheetDescription = "Create a recurring or one-time event for your department."
  else if (isOccurrence) sheetDescription = `Editing only ${occurrenceDate}. Other occurrences are unaffected.`
  else sheetDescription = "Changes apply to all future occurrences."

  // ── Submit ─────────────────────────────────────────────────────────────────

  const onSubmit = (values: FormValues) => {
    // For create and series-edit paths, start_date is required (it's hidden in occurrence mode)
    if (!isOccurrence && !values.start_date) {
      form.setError("start_date", { message: "Start date is required" })
      return
    }

    // For create and series-edit paths, end_date must be >= start_date if set
    if (!isOccurrence && values.end_date && values.start_date && values.end_date < values.start_date) {
      form.setError("end_date", { message: "End date must be on or after the start date" })
      return
    }

    // Validate weekly recurrence has at least one weekday selected
    if (recurrence?.freq === "weekly" && (!recurrence.byweekday || recurrence.byweekday.length === 0)) {
      form.setError("title", {
        type: "manual",
        message: "Pick at least one weekday for weekly recurrence",
      })
      return
    }

    const opts = {
      onSuccess: () => {
        onOpenChange(false)
        onSuccess?.()
      },
    }

    if (isOccurrence && item) {
      // Edit occurrence override
      modifyOccurrence.mutate(
        {
          date: occurrenceDate!,
          body: {
            override_title: values.title,
            override_description: values.description || null,
            override_all_day: values.all_day,
            override_start_time: values.all_day ? null : (values.start_time || null),
            override_end_time: values.all_day ? null : (values.end_time || null),
          },
        },
        opts,
      )
    } else if (isEdit && item) {
      // Edit whole series
      update.mutate(
        {
          id: item.id,
          body: {
            title: values.title,
            description: values.description || null,
            all_day: values.all_day,
            start_time: values.all_day ? null : (values.start_time || null),
            end_time: values.all_day ? null : (values.end_time || null),
            about_user_id: values.about_user_id || null,
            end_date: values.end_date || null,
            recurrence,
          },
        },
        opts,
      )
    } else {
      // Create new event
      create.mutate(
        {
          title: values.title,
          description: values.description || null,
          all_day: values.all_day,
          start_time: values.all_day ? null : (values.start_time || null),
          end_time: values.all_day ? null : (values.end_time || null),
          about_user_id: values.about_user_id || null,
          department_id: departmentId,
          recurrence,
          start_date: values.start_date!,
          end_date: values.end_date || null,
        },
        opts,
      )
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{sheetTitle}</SheetTitle>
          <SheetDescription>{sheetDescription}</SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            noValidate
            className="space-y-4 px-4 pb-4"
          >
            {error && (
              <Alert variant="destructive">
                <AlertTitle>{isEdit ? "Update failed" : "Create failed"}</AlertTitle>
                <AlertDescription>{error.detail}</AlertDescription>
              </Alert>
            )}

            {/* Title */}
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Event title" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="Optional details…" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* About user — optional; pass empty list if no endpoint ready */}
            {!isOccurrence && (
              <FormField
                control={form.control}
                name="about_user_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>About (optional)</FormLabel>
                    <FormControl>
                      <UserCombobox
                        users={aboutUsers.data?.items ?? []}
                        isLoading={aboutUsers.isLoading}
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        placeholder="Select a user…"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* All-day switch */}
            <FormField
              control={form.control}
              name="all_day"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-2">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <Label>All day</Label>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Start/end time — shown when not all-day */}
            {!allDay && (
              <div className="flex gap-3">
                <FormField
                  control={form.control}
                  name="start_time"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel>Start time</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="end_time"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel>End time</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {/* Start date — shown for create and series edit */}
            {!isOccurrence && (
              <FormField
                control={form.control}
                name="start_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* End date — shown for create and series edit */}
            {!isOccurrence && (
              <FormField
                control={form.control}
                name="end_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End date (optional)</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Recurrence — hidden for occurrence edits */}
            {!isOccurrence && (
              <div className="space-y-1">
                <RecurrenceBuilder value={recurrence} onChange={setRecurrence} />
              </div>
            )}

            <SheetFooter>
              <Button type="submit" disabled={submitting}>
                {submitting
                  ? isEdit
                    ? "Saving…"
                    : "Creating…"
                  : isEdit
                    ? "Save changes"
                    : "Create event"}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  )
}
