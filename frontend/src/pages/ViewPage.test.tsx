import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Route, Routes } from "react-router"

import { ViewPage } from "./ViewPage"
import {
  jsonResponse,
  renderWithProviders,
  stubFetchByRoute,
} from "@/test/test-utils"

const VIEW = {
  id: "v1",
  name: "Budget health",
  order_index: 0,
  published_department_id: null,
  is_owner: true,
  owner_name: "Owner User",
  published_department_code: null,
}
const TEXT_BLOCK = {
  id: "b1",
  view_id: "v1",
  block_type: "text",
  title: "Notes",
  order_index: 0,
  width: 2,
  accent: "indigo",
  config: { md: "hello world", size_preset: "body" },
}

function stubs(
  blocks: unknown[] = [TEXT_BLOCK],
  view: Record<string, unknown> = VIEW,
) {
  return stubFetchByRoute([
    {
      match: (u) => u.includes("/api/views/v1/blocks") && !u.includes("data"),
      respond: () => jsonResponse({ items: blocks }),
    },
    {
      match: (u, init) =>
        u.endsWith("/api/views/v1") && init?.method === "PATCH",
      respond: () => jsonResponse({ ...view, name: "Budget" }),
    },
    {
      match: (u) => u.endsWith("/api/views/v1/duplicate"),
      respond: () =>
        jsonResponse({
          ...VIEW,
          id: "v2",
          name: "Budget health (copy)",
          is_owner: true,
          published_department_id: null,
          published_department_code: null,
        }),
    },
    {
      match: (u) => u.endsWith("/api/views/v1/publish"),
      respond: () =>
        jsonResponse({
          ...view,
          published_department_id: "dep1",
          published_department_code: "DIV1",
        }),
    },
    {
      match: (u) => u.endsWith("/api/views/v1/unpublish"),
      respond: () =>
        jsonResponse({
          ...view,
          published_department_id: null,
          published_department_code: null,
        }),
    },
    {
      match: (u) => u.endsWith("/api/auth/me/manageable-departments"),
      respond: () =>
        jsonResponse([{ id: "dep1", code: "DIV1", name: "Protection" }]),
    },
    {
      match: (u) => u.endsWith("/api/views"),
      respond: () => jsonResponse({ items: [view] }),
    },
  ])
}

function setup() {
  return renderWithProviders(
    <Routes>
      <Route path="/views/:vid" element={<ViewPage />} />
    </Routes>,
    { route: "/views/v1" },
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("ViewPage", () => {
  it("renders the view name and its blocks", async () => {
    stubs()
    setup()
    await waitFor(() => {
      expect(screen.getByText("Budget health")).toBeInTheDocument()
    })
    expect(screen.getByText("Notes")).toBeInTheDocument()
    expect(screen.getByText("hello world")).toBeInTheDocument()
    // read mode: no block chrome
    expect(screen.queryByLabelText("Block actions")).not.toBeInTheDocument()
  })

  it("Edit toggles chrome and add-block library", async () => {
    stubs()
    setup()
    await waitFor(() => screen.getByText("Budget health"))
    await userEvent.click(screen.getByRole("button", { name: /^edit$/i }))
    expect(screen.getByRole("button", { name: /done/i })).toBeInTheDocument()
    expect(screen.getByLabelText("Block actions")).toBeInTheDocument()
    expect(screen.getByText(/add block/i)).toBeInTheDocument()
    expect(screen.getByText(/metric card/i)).toBeInTheDocument()
  })

  it("rename commits a PATCH", async () => {
    const fetchSpy = stubs()
    setup()
    await waitFor(() => screen.getByText("Budget health"))
    await userEvent.click(screen.getByRole("button", { name: /^edit$/i }))
    await userEvent.click(screen.getByText("Budget health"))
    const input = screen.getByDisplayValue("Budget health")
    await userEvent.clear(input)
    await userEvent.type(input, "Budget{Enter}")
    await waitFor(() => {
      const patch = fetchSpy.mock.calls.find(
        ([u, init]) =>
          String(u).endsWith("/api/views/v1") &&
          (init as RequestInit)?.method === "PATCH",
      )
      expect(patch).toBeTruthy()
      expect(JSON.parse(String((patch![1] as RequestInit).body))).toEqual({
        name: "Budget",
      })
    })
  })

  it("pressing E while the config sheet is open does not exit edit mode", async () => {
    stubs()
    setup()
    await waitFor(() => screen.getByText("Budget health"))
    await userEvent.click(screen.getByRole("button", { name: /^edit$/i }))
    // Open the config sheet via the block kebab.
    await userEvent.click(screen.getByLabelText("Block actions"))
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /configure/i }),
    )
    const sheet = await screen.findByRole("dialog")
    expect(sheet).toBeInTheDocument()
    // Put focus on a non-input element inside the sheet (the old
    // handler only spared input/textarea targets), then press `e`. It
    // must NOT toggle edit mode while the sheet is up — that would
    // unmount the sheet and silently discard unsaved config.
    await userEvent.click(screen.getByRole("button", { name: /accent blue/i }))
    await userEvent.keyboard("e")
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    // Close the sheet normally; the page must still be in edit mode
    // (while the sheet was modal the page tree was aria-hidden, so the
    // Done button is only queryable after it closes).
    await userEvent.keyboard("{Escape}")
    expect(
      await screen.findByRole("button", { name: /done/i }),
    ).toBeInTheDocument()
  })

  it("reader (not owner) sees read-only with a Duplicate button, no Edit", async () => {
    stubs([TEXT_BLOCK], {
      ...VIEW,
      is_owner: false,
      owner_name: "Dana DM",
      published_department_id: "dep1",
      published_department_code: "DIV1",
    })
    setup()
    await waitFor(() => screen.getByText("Budget health"))
    expect(
      screen.queryByRole("button", { name: /^edit$/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /duplicate/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/published by dana dm/i)).toBeInTheDocument()
    expect(screen.getByText(/shared · div1/i)).toBeInTheDocument()
  })

  it("owner of a published view sees the shared badge and an Edit button", async () => {
    stubs([TEXT_BLOCK], {
      ...VIEW,
      is_owner: true,
      published_department_id: "dep1",
      published_department_code: "DIV1",
    })
    setup()
    await waitFor(() => screen.getByText("Budget health"))
    expect(
      screen.getByRole("button", { name: /^edit$/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/shared · div1/i)).toBeInTheDocument()
  })

  it("owner edit mode exposes a Share menu with manageable depts", async () => {
    stubs([TEXT_BLOCK], { ...VIEW, is_owner: true })
    setup()
    await waitFor(() => screen.getByText("Budget health"))
    await userEvent.click(screen.getByRole("button", { name: /^edit$/i }))
    await userEvent.click(screen.getByRole("button", { name: /share/i }))
    expect(
      await screen.findByRole("menuitem", { name: /publish to div1/i }),
    ).toBeInTheDocument()
  })

  it("clicking Duplicate posts to the duplicate endpoint and navigates", async () => {
    const spy = stubs([TEXT_BLOCK], {
      ...VIEW,
      is_owner: false,
      owner_name: "Dana DM",
    })
    setup()
    await waitFor(() => screen.getByText("Budget health"))
    await userEvent.click(screen.getByRole("button", { name: /duplicate/i }))
    await waitFor(() => {
      const call = spy.mock.calls.find(
        ([u, init]) =>
          String(u).endsWith("/duplicate") &&
          (init as RequestInit)?.method === "POST",
      )
      expect(call).toBeTruthy()
    })
  })

  it("empty view in read mode shows the empty state", async () => {
    stubs([])
    setup()
    await waitFor(() => screen.getByText("Budget health"))
    expect(screen.getByText(/no blocks yet/i)).toBeInTheDocument()
  })
})
