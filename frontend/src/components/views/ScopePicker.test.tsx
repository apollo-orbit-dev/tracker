import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { ScopePicker } from "./ScopePicker"
import {
  jsonResponse,
  renderWithProviders,
  stubFetchByRoute,
} from "@/test/test-utils"

const DEPTS = [
  { id: "d1", code: "DIV1", name: "Dept 8" },
  { id: "d2", code: "DIV3", name: "Dept 2" },
]
const CLIENTS = {
  items: [
    { id: "c1", code: "CON", name: "CON", department_id: "d1" },
    { id: "c2", code: "OTH", name: "Other", department_id: "d2" },
  ],
}
const DISCS = {
  items: [{ id: "k1", code: "PC", name: "Design", department_id: "d1" }],
}

function stubs() {
  // useMyDepartments hits /api/auth/me/departments; /me/departments
  // matches it as well as the documented path (Phase 7.14 caveat a).
  return stubFetchByRoute([
    { match: (u) => u.includes("/me/departments"), respond: () => jsonResponse(DEPTS) },
    { match: (u) => u.includes("/api/admin/clients"), respond: () => jsonResponse(CLIENTS) },
    { match: (u) => u.includes("/api/admin/disciplines"), respond: () => jsonResponse(DISCS) },
  ])
}

describe("ScopePicker", () => {
  it("renders DCD + lifecycle when show.dcd is true", async () => {
    stubs()
    renderWithProviders(
      <ScopePicker
        scope={{}}
        show={{ dcd: true, lifecycle: true }}
        onChange={() => {}}
        idPrefix="t"
      />,
    )
    await waitFor(() => expect(screen.getByLabelText(/department/i)).toBeInTheDocument())
    expect(screen.getByLabelText(/client/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/discipline/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/lifecycle/i)).toBeInTheDocument()
  })

  it("hides DCD but keeps lifecycle when show.dcd is false", async () => {
    stubs()
    renderWithProviders(
      <ScopePicker
        scope={{}}
        show={{ dcd: false, lifecycle: true }}
        onChange={() => {}}
        idPrefix="t"
      />,
    )
    await waitFor(() => expect(screen.getByLabelText(/lifecycle/i)).toBeInTheDocument())
    expect(screen.queryByLabelText(/department/i)).not.toBeInTheDocument()
  })

  it("selecting a department emits it and clears client+discipline", async () => {
    stubs()
    const onChange = vi.fn()
    renderWithProviders(
      <ScopePicker
        scope={{ client_id: "c1", discipline_id: "k1" }}
        show={{ dcd: true, lifecycle: true }}
        onChange={onChange}
        idPrefix="t"
      />,
    )
    await waitFor(() => screen.getByLabelText(/department/i))
    await userEvent.click(screen.getByLabelText(/department/i))
    await userEvent.click(await screen.findByRole("option", { name: /DIV1/i }))
    expect(onChange).toHaveBeenCalledWith({
      department_id: "d1",
      client_id: null,
      discipline_id: null,
    })
  })

  it("client select is disabled until a department is chosen", async () => {
    stubs()
    renderWithProviders(
      <ScopePicker
        scope={{}}
        show={{ dcd: true, lifecycle: true }}
        onChange={() => {}}
        idPrefix="t"
      />,
    )
    await waitFor(() => screen.getByLabelText(/client/i))
    expect(screen.getByLabelText(/client/i)).toBeDisabled()
  })

  it("lifecycle select emits lifecycle_state", async () => {
    stubs()
    const onChange = vi.fn()
    renderWithProviders(
      <ScopePicker
        scope={{}}
        show={{ dcd: true, lifecycle: true }}
        onChange={onChange}
        idPrefix="t"
      />,
    )
    await waitFor(() => screen.getByLabelText(/lifecycle/i))
    await userEvent.click(screen.getByLabelText(/lifecycle/i))
    await userEvent.click(await screen.findByRole("option", { name: /^active$/i }))
    expect(onChange).toHaveBeenCalledWith({ lifecycle_state: "active" })
  })
})
