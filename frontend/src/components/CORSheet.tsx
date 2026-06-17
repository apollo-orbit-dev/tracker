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
import { ApiError } from "@/api/auth"
import { type COR, useCORCreate, useCORUpdate } from "@/api/cors"
import { COR_STATUSES, corStatusLabel } from "@/lib/cor-status"

const formSchema = z.object({
  number: z
    .string()
    .min(1, "Number is required")
    .max(32, "Max 32 characters")
    .regex(/^\S+$/, "No whitespace"),
  description: z.string().min(1, "Description is required").max(2000),
  amount: z
    .string()
    .regex(/^-?\d+(\.\d{1,2})?$/, "Enter a number with up to 2 decimal places"),
  submitted_date: z.string().optional(),
  approved_date: z.string().optional(),
  status: z.string().min(1),
})

type FormValues = z.infer<typeof formSchema>

type Props = {
  pid: string
  open: boolean
  onOpenChange: (open: boolean) => void
  item?: COR | null
  onSuccess?: () => void
}

export function CORSheet({ pid, open, onOpenChange, item, onSuccess }: Props) {
  const isEdit = !!item
  const create = useCORCreate(pid)
  const update = useCORUpdate(pid)
  const submitting = create.isPending || update.isPending
  const error =
    (create.error instanceof ApiError && create.error) ||
    (update.error instanceof ApiError && update.error) ||
    null

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as Resolver<FormValues>,
    defaultValues: {
      number: "",
      description: "",
      amount: "0",
      submitted_date: "",
      approved_date: "",
      status: "draft",
    },
  })

  useEffect(() => {
    if (open) {
      if (item) {
        form.reset({
          number: item.number,
          description: item.description,
          amount: item.amount,
          submitted_date: item.submitted_date ?? "",
          approved_date: item.approved_date ?? "",
          status: item.status,
        })
      } else {
        form.reset({
          number: "",
          description: "",
          amount: "0",
          submitted_date: "",
          approved_date: "",
          status: "draft",
        })
      }
      create.reset()
      update.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id])

  const onSubmit = (values: FormValues) => {
    const body = {
      number: values.number,
      description: values.description,
      amount: values.amount,
      submitted_date: values.submitted_date || null,
      approved_date: values.approved_date || null,
      status: values.status,
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
          <SheetTitle>{isEdit ? "Edit COR" : "New COR"}</SheetTitle>
          <SheetDescription>
            Change Order Request. Number is unique within this project.
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
              name="number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Number</FormLabel>
                  <FormControl>
                    <Input placeholder="CO-001" autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
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
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount (USD)</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0.00"
                      {...field}
                    />
                  </FormControl>
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
                      {COR_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {corStatusLabel(s)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-2">
              <FormField
                control={form.control}
                name="submitted_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Submitted</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="approved_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Approved</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <SheetFooter>
              <Button type="submit" disabled={submitting}>
                {submitting
                  ? isEdit
                    ? "Saving…"
                    : "Creating…"
                  : isEdit
                    ? "Save changes"
                    : "Create COR"}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  )
}
