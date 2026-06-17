import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { MarkdownText } from "./MarkdownText"

describe("MarkdownText", () => {
  it("renders common-formatting markdown", () => {
    render(
      <MarkdownText
        sizePreset="body"
        md={
          "# Title\n\n" +
          "Some **bold** and _italic_ and `code`.\n\n" +
          "- one\n- two\n\n" +
          "> a quote"
        }
      />,
    )
    expect(
      screen.getByRole("heading", { level: 1, name: "Title" }),
    ).toBeInTheDocument()
    expect(screen.getByText("bold").tagName).toBe("STRONG")
    expect(screen.getByText("italic").tagName).toBe("EM")
    expect(screen.getByText("code").tagName).toBe("CODE")
    expect(screen.getAllByRole("listitem")).toHaveLength(2)
    expect(screen.getByText("a quote").closest("blockquote")).not.toBeNull()
  })

  it("opens links in a new tab with rel protection", () => {
    render(
      <MarkdownText sizePreset="body" md="[Example](https://example.com/path)" />,
    )
    const link = screen.getByRole("link", { name: "Example" })
    expect(link).toHaveAttribute("href", "https://example.com/path")
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", "noopener noreferrer")
  })

  it("neutralizes javascript: link schemes", () => {
    const { container } = render(
      <MarkdownText sizePreset="body" md="[click](javascript:alert(1))" />,
    )
    // The anchor text still renders, but with the dangerous scheme blanked the
    // href is gone entirely — the element is inert (no live `javascript:` URI).
    const anchor = container.querySelector("a")
    expect(anchor?.textContent).toBe("click")
    expect(anchor?.getAttribute("href") ?? "").not.toContain("javascript:")
  })

  it("does not render embedded raw HTML as live elements", () => {
    const { container } = render(
      <MarkdownText
        sizePreset="body"
        md={
          'before <script>window.__pwned = true</script> ' +
          '<img src=x onerror="window.__pwned = true"> after'
        }
      />,
    )
    expect(container.querySelector("script")).toBeNull()
    // an <img> from raw HTML must not survive with an event handler
    const img = container.querySelector("img")
    expect(img?.getAttribute("onerror") ?? null).toBeNull()
    expect(
      (window as unknown as { __pwned?: boolean }).__pwned,
    ).toBeUndefined()
  })

  it("applies the size preset as a base text class", () => {
    const { container, rerender } = render(
      <MarkdownText sizePreset="heading" md="hi" />,
    )
    expect((container.firstChild as HTMLElement).className).toContain("text-lg")

    rerender(<MarkdownText sizePreset="caption" md="hi" />)
    expect((container.firstChild as HTMLElement).className).toContain("text-xs")
  })
})
