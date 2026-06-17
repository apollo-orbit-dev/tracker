// Phase 7.19 — render a Custom-View text block's stored `md` as
// common-formatting markdown, safe by construction.
//
// Security posture:
//   1. No `rehype-raw` → embedded raw HTML is never parsed into the tree.
//   2. `rehype-sanitize` allow-list → strips disallowed tags/attrs/handlers.
//   3. Link schemes restricted to http/https/mailto via `urlTransform`,
//      and external links open with rel="noopener noreferrer".
import Markdown, { type Components } from "react-markdown"
import rehypeSanitize, { defaultSchema } from "rehype-sanitize"

import { cn } from "@/lib/utils"

type SizePreset = "heading" | "body" | "caption"

// Base text size for the whole block. Markdown headings/etc. scale relative
// to this. Fixes the prior gap where size_preset was stored but never applied.
const SIZE_CLASS: Record<SizePreset, string> = {
  heading: "text-lg",
  body: "text-sm",
  caption: "text-xs text-muted-foreground",
}

// Element styling via arbitrary-variant classes so we don't have to override
// every renderer (Tailwind's preflight strips list markers otherwise).
const PROSE_CLASS = cn(
  "space-y-2 leading-relaxed",
  "[&_h1]:text-lg [&_h1]:font-semibold",
  "[&_h2]:text-base [&_h2]:font-semibold",
  "[&_h3]:font-semibold [&_h4]:font-semibold",
  "[&_ul]:list-disc [&_ul]:space-y-0.5 [&_ul]:pl-5",
  "[&_ol]:list-decimal [&_ol]:space-y-0.5 [&_ol]:pl-5",
  "[&_a]:font-medium [&_a]:underline [&_a]:underline-offset-2",
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em]",
  "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
)

// Allow only the common-formatting subset. Anything outside this (script,
// img, iframe, style, raw HTML, event-handler attrs) is dropped by sanitize.
const SCHEMA = {
  ...defaultSchema,
  tagNames: [
    "p",
    "strong",
    "em",
    "del",
    "a",
    "code",
    "pre",
    "blockquote",
    "ul",
    "ol",
    "li",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "br",
  ],
  attributes: {
    ...defaultSchema.attributes,
    a: [["href"]],
  },
}

const SAFE_SCHEMES = ["http:", "https:", "mailto:"]

// Belt-and-suspenders to rehype-sanitize: blank any URL whose scheme isn't
// explicitly safe (e.g. javascript:, data:).
function safeUrl(url: string): string {
  try {
    const u = new URL(url, "https://placeholder.invalid/")
    return SAFE_SCHEMES.includes(u.protocol) ? url : ""
  } catch {
    return ""
  }
}

// Only override the anchor — it needs new-tab + rel attributes, not just
// styling. `node` is react-markdown's AST handle; we don't forward it.
const COMPONENTS: Components = {
  a({ node: _node, ...props }) {
    void _node
    return <a {...props} target="_blank" rel="noopener noreferrer" />
  },
}

export function MarkdownText({
  md,
  sizePreset,
}: {
  md: string
  sizePreset: SizePreset
}) {
  return (
    <div className={cn(PROSE_CLASS, SIZE_CLASS[sizePreset])}>
      <Markdown
        rehypePlugins={[[rehypeSanitize, SCHEMA]]}
        urlTransform={safeUrl}
        components={COMPONENTS}
      >
        {md}
      </Markdown>
    </div>
  )
}
