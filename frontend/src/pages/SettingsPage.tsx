import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { PageHeader } from "@/components/PageHeader"

export function SettingsPage() {
  return (
    <>
      <PageHeader title="User Settings" />
      <main className="space-y-4 px-6 py-8">
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
    </>
  )
}
