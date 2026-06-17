import type { ReactNode } from "react"
import { render } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"
import { vi } from "vitest"

type Options = {
  route?: string
}

export function renderWithProviders(ui: ReactNode, { route = "/" }: Options = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </QueryClientProvider>,
    ),
  }
}

type RouteHandler = {
  match: (url: string, init?: RequestInit) => boolean
  respond: (url: string, init?: RequestInit) => Response | Promise<Response>
}

export function stubFetchByRoute(handlers: RouteHandler[]) {
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = typeof url === "string" ? url : url.toString()
    for (const h of handlers) {
      if (h.match(u, init)) {
        return h.respond(u, init)
      }
    }
    return new Response(JSON.stringify({ detail: "no stub" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  })
  vi.stubGlobal("fetch", fn)
  return fn
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}
