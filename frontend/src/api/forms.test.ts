import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, act } from "@testing-library/react"
import { createElement } from "react"
import { describe, expect, it } from "vitest"

import { useFormCreate } from "@/api/forms"
import { jsonResponse, stubFetchByRoute } from "@/test/test-utils"

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}

describe("useFormCreate", () => {
  it("posts to /api/forms with the JSON body", async () => {
    const fetchSpy = stubFetchByRoute([
      {
        match: (url, init) =>
          url === "/api/forms" && init?.method === "POST",
        respond: () =>
          jsonResponse({
            id: "f1",
            department_id: "d1",
            name: "Test Form",
            description: null,
            target_entity: null,
            status: "draft",
            created_by: "u1",
            created_at: "2026-06-20T00:00:00Z",
            updated_at: "2026-06-20T00:00:00Z",
            fields: [],
          }),
      },
    ])

    const { result } = renderHook(() => useFormCreate(), { wrapper })

    await act(async () => {
      result.current.mutate({ name: "Test Form", department_id: "d1" })
      await new Promise((r) => setTimeout(r, 0))
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/forms",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Test Form", department_id: "d1" }),
      }),
    )
  })
})
