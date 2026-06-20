import { Switch } from "@/components/ui/switch"
import { useAppSetting, useUpdateAppSetting } from "@/api/settings"

export function AdminSettingsPage() {
  const setting = useAppSetting("holidays")
  const update = useUpdateAppSetting("holidays")
  const enabled = Boolean((setting.data?.value as { enabled?: boolean } | undefined)?.enabled)

  return (
    <div className="max-w-2xl space-y-6 p-4">
      <div>
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Organization-wide calendar settings.</p>
      </div>
      <div className="flex items-center justify-between rounded-md border p-4">
        <div>
          <div className="text-sm font-medium">Show US holidays on calendars</div>
          <div className="text-sm text-muted-foreground">
            US federal holidays appear as context on everyone's calendar.
          </div>
        </div>
        <Switch
          aria-label="Show US holidays on calendars"
          checked={enabled}
          disabled={setting.isLoading || update.isPending}
          onCheckedChange={(checked) => update.mutate({ enabled: checked, countries: ["US"] })}
        />
      </div>
      {update.error && (
        <p className="text-sm text-destructive">{update.error.detail}</p>
      )}
    </div>
  )
}
