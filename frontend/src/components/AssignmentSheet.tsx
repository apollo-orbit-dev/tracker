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
import { Textarea } from "@/components/ui/textarea"
import { UserCombobox } from "@/components/UserCombobox"
import { ApiError } from "@/api/auth"
import {
  type Assignment,
  useAssignmentCreate,
  useAssignmentUpdate,
  useEligibleAssignees,
} from "@/api/assignments"
import { ASSIGNMENT_STATUSES, assignmentStatusLabel } from "@/lib/assignment-status"

const NONE = "__none__"

const formSchema = z.object({
  description: z.string().min(1, "Description is required").max(2000),
  assignee_user_id: z.string().uuid("Pick an assignee"),
  milestone_id: z.string(), // "" or NONE means no milestone
  due_date: z.string().optional(),
  status: z.string().min(1),
})

type FormValues = z.infer<typeof formSchema>

type Props = {
  pid: string
  open: boolean
  onOpenChange: (open: boolean) => void
  milestones: { id: string; name: string }[]
  item?: Assignment | null
  onSuccess?: () => void
}

export function AssignmentSheet({
  pid,
  open,
  onOpenChange,
  milestones,
  item,
  onSuccess,
}: Props) {
  const isEdit = !!item
  const create = useAssignmentCreate(pid)
  const update = useAssignmentUpdate(pid)
  const eligible = useEligibleAssignees(open ? pid : undefined)
  const submitting = create.isPending || update.isPending
  const error =
    (create.error instanceof ApiError && create.error) ||
    (update.error instanceof ApiError && update.error) ||
    null

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as Resolver<FormValues>,
    defaultValues: {
      description: "",
      assignee_user_id: "",
      milestone_id: NONE,
      due_date: "",
      status: "open",
    },
  })

  useEffect(() => {
    if (open) {
      form.reset(
        item
          ? {
              description: item.description,
              assignee_user_id: item.assignee_user_id,
              milestone_id: item.milestone_id ?? NONE,
              due_date: item.due_date ?? "",
              status: item.status,
            }
          : {
              description: "",
              assignee_user_id: "",
              milestone_id: NONE,
              due_date: "",
              status: "open",
            },
      )
      create.reset()
      update.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id])

  const onSubmit = (values: FormValues) => {
    const body = {
      description: values.description,
      assignee_user_id: values.assignee_user_id,
      milestone_id:
        values.milestone_id === NONE || values.milestone_id === ""
          ? null
          : values.milestone_id,
      due_date: values.due_date || null,
      status: values.status,
    }
    const opts = {
      onSuccess: () => {
        onOpenChange(false)
        onSuccess?.()
      },
    }
    if (isEdit && item) update.mutate({ id: item.id, body }, opts)
    else create.mutate(body, opts)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit assignment" : "New assignment"}</SheetTitle>
          <SheetDescription>
            Assign work to someone who can already view this project.
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
                <AlertTitle>{isEdit ? "Update failed" : "Create failed"}</AlertTitle>
                <AlertDescription>{error.detail}</AlertDescription>
              </Alert>
            )}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="assignee_user_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Assignee</FormLabel>
                  <FormControl>
                    <UserCombobox
                      users={eligible.data?.items ?? []}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="milestone_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Milestone (optional)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NONE}>None</SelectItem>
                      {milestones.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
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
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ASSIGNMENT_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {assignmentStatusLabel(s)}
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
              name="due_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Due date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
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
                    : "Create assignment"}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  )
}
