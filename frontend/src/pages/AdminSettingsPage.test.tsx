import { afterEach, describe, expect, it } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { AdminSettingsPage } from "./AdminSettingsPage"
import { jsonResponse, renderWithProviders, stubFetchByRoute } from "@/test/test-utils"

describe("AdminSettingsPage", () => {
  afterEach(() => {
    // stubFetchByRoute uses vi.stubGlobal — unstub after each test
    import("vitest").then(({ vi }) => vi.unstubAllGlobals())
  })

  it("reads the holidays setting and PUTs enabled=true when toggled on", async () => {
    const putBodies: unknown[] = []

    stubFetchByRoute([
      {
        match: (u) => u.includes("/api/admin/settings/holidays") && true,
        respond: (_u, init) => {
          if (init?.method === "PUT") {
            const body = JSON.parse(init.body as string)
            putBodies.push(body)
            return jsonResponse({ key: "holidays", value: { enabled: true, countries: ["US"] } })
          }
          // GET
          return jsonResponse({ key: "holidays", value: { enabled: false, countries: ["US"] } })
        },
      },
    ])

    renderWithProviders(<AdminSettingsPage />)

    const toggle = await screen.findByRole("switch", { name: /us holidays/i })
    expect(toggle).not.toBeChecked()

    await userEvent.click(toggle)

    await waitFor(() => {
      expect(putBodies.length).toBeGreaterThan(0)
    })

    expect(putBodies[0]).toEqual({ value: { enabled: true, countries: ["US"] } })
  })
})
