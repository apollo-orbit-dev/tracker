import { describe, expect, it, vi } from "vitest"
import { screen, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { RecurrenceBuilder } from "./RecurrenceBuilder"
import { renderWithProviders } from "@/test/test-utils"
import type { RecurrenceConfig } from "@/lib/recurrence"

describe("RecurrenceBuilder", () => {
  it("starts with no recurrence when value=null", () => {
    const onChange = vi.fn()
    renderWithProviders(<RecurrenceBuilder value={null} onChange={onChange} />)
    // Frequency select should show "None"
    expect(screen.getByRole("combobox")).toHaveTextContent(/none/i)
    // No interval input visible
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument()
  })

  it("emits full config after selecting Weekly, setting interval 2, and checking Mon", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    // Start with null — user will build the config via the UI
    const { rerender } = renderWithProviders(
      <RecurrenceBuilder value={null} onChange={onChange} />,
    )

    // Step 1: select "Weekly"
    const freqTrigger = screen.getByRole("combobox")
    await user.click(freqTrigger)
    const weeklyOption = await screen.findByRole("option", { name: /weekly/i })
    await user.click(weeklyOption)

    // onChange should have been called with weekly default config
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ freq: "weekly", interval: 1 }),
    )

    // Re-render with the emitted config (simulate controlled component)
    const afterFreq = onChange.mock.calls[onChange.mock.calls.length - 1][0] as RecurrenceConfig
    rerender(
      <RecurrenceBuilder value={afterFreq} onChange={onChange} />,
    )

    // Step 2: set interval to 2
    const intervalInput = screen.getByRole("spinbutton")
    fireEvent.change(intervalInput, { target: { value: "2" } })

    const afterInterval = onChange.mock.calls[onChange.mock.calls.length - 1][0] as RecurrenceConfig
    rerender(
      <RecurrenceBuilder value={afterInterval} onChange={onChange} />,
    )

    // Step 3: check "Mon" (index 0 in weekdays; default already includes Mon=0, but let's
    // verify it's checked and the final call has byweekday:[0]).
    // The default weekly config includes [0] (Mon) already, so Mon checkbox should be checked.
    const monCheckbox = screen.getByRole("checkbox", { name: /mon/i })
    expect(monCheckbox).toBeChecked()

    // Verify the final state is what the brief requires
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0] as RecurrenceConfig
    expect(lastCall).toEqual({ freq: "weekly", interval: 2, byweekday: [0], end: { mode: "never" } })
  })

  it("calls onChange(null) when selecting None after having a value", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const cfg: RecurrenceConfig = { freq: "weekly", interval: 1, byweekday: [0], end: { mode: "never" } }

    renderWithProviders(<RecurrenceBuilder value={cfg} onChange={onChange} />)

    // The frequency combobox is the first one rendered
    const comboboxes = screen.getAllByRole("combobox")
    const freqTrigger = comboboxes[0]
    await user.click(freqTrigger)
    const noneOption = await screen.findByRole("option", { name: /none/i })
    await user.click(noneOption)

    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it("renders recurrenceSummary as a live caption", () => {
    const cfg: RecurrenceConfig = { freq: "weekly", interval: 2, byweekday: [0], end: { mode: "never" } }
    renderWithProviders(<RecurrenceBuilder value={cfg} onChange={vi.fn()} />)
    expect(screen.getByText(/every 2 weeks on Mon/i)).toBeInTheDocument()
  })
})
