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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { ApiError } from "@/api/auth"
import { type UserItem, useUserResetPassword } from "@/api/users"

const schema = z.object({
  password: z
    .string()
    .min(12, "Password must be at least 12 characters")
    .max(200),
})

type FormValues = z.infer<typeof schema>

type Props = {
  item: UserItem | null
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function UserResetPasswordSheet({
  item,
  onOpenChange,
  onSuccess,
}: Props) {
  const open = item !== null
  const reset = useUserResetPassword()
  const error = reset.error instanceof ApiError ? reset.error : null

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as Resolver<FormValues>,
    defaultValues: { password: "" },
  })

  useEffect(() => {
    if (open) {
      form.reset({ password: "" })
      reset.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id])

  const onSubmit = (values: FormValues) => {
    if (!item) return
    reset.mutate(
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
          <SheetTitle>Reset password</SheetTitle>
          <SheetDescription>
            {item && (
              <>
                Set a new password for <strong>{item.email}</strong>. Existing
                sessions stay active for this release — make sure the user
                logs out and back in if you want to invalidate them.
              </>
            )}
          </SheetDescription>
        </SheetHeader>
        {error && (
          <div className="px-4">
            <Alert variant="destructive">
              <AlertTitle>Reset failed</AlertTitle>
              <AlertDescription>{error.detail}</AlertDescription>
            </Alert>
          </div>
        )}
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            noValidate
            className="space-y-4 px-4 pb-4"
          >
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      placeholder="At least 12 characters"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <SheetFooter>
              <Button type="submit" disabled={reset.isPending}>
                {reset.isPending ? "Resetting…" : "Reset password"}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  )
}
