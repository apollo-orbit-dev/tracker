import { useMemo } from "react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useTopbarCrumbs } from "@/hooks/useTopbarCrumbs"

export function SettingsPage() {
  useTopbarCrumbs(useMemo(() => [{ label: "User Settings" }], []))
  return (
    <main className="space-y-5 px-6 py-7">
      <h1 className="text-[20px] font-semibold tracking-[-0.01em]">
        User Settings
      </h1>
      <Card>
          <CardHeader>
            <CardTitle>Coming soon</CardTitle>
            <CardDescription>
              Your profile and preferences will live here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              No settings to configure yet.
            </p>
          </CardContent>
        </Card>
    </main>
  )
}
