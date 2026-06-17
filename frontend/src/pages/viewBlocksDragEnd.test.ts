import { describe, expect, it } from "vitest"

import { applyBlocksDragEnd } from "./viewBlocksDragEnd"

const b = (id: string, order_index: number) => ({ id, order_index }) as never

describe("applyBlocksDragEnd", () => {
  it("moves a block and reindexes", () => {
    const out = applyBlocksDragEnd([b("a", 0), b("b", 1), b("c", 2)], {
      active: { id: "c" },
      over: { id: "a" },
    })
    expect(out.map((x: { id: string }) => x.id)).toEqual(["c", "a", "b"])
    expect(out.map((x: { order_index: number }) => x.order_index)).toEqual([
      0, 1, 2,
    ])
  })
  it("no-ops without a drop target", () => {
    const list = [b("a", 0), b("b", 1)]
    expect(applyBlocksDragEnd(list, { active: { id: "a" }, over: null })).toBe(
      list,
    )
  })
})
