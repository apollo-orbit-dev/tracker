import { MoreHorizontal, Search } from "lucide-react"
import { type CSSProperties, useMemo, useState } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/Badge"
import { TaxonomyDeleteDialog } from "@/components/TaxonomyDeleteDialog"
import { TaxonomySheet } from "@/components/TaxonomySheet"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useTopbarCrumbs } from "@/hooks/useTopbarCrumbs"
import { useMyDepartments } from "@/api/me"
import {
  isDeptScoped,
  type TaxonomyItem,
  type TaxonomyPath,
  useTaxonomyList,
} from "@/api/taxonomy"

type Props = {
  path: TaxonomyPath
  title: string
  description: string
  singular: string
}

const DENSITY_ROW_STYLE: CSSProperties = {
  height: "var(--row-h)",
  fontSize: "var(--fs-table)",
}
const DENSITY_CELL_STYLE: CSSProperties = {
  paddingTop: "var(--row-py)",
  paddingBottom: "var(--row-py)",
}

export function TaxonomyManagePage({
  path,
  title,
  description,
  singular,
}: Props) {
  useTopbarCrumbs(
    useMemo(() => [{ label: "Admin" }, { label: title }], [title]),
  )

  const [includeDeleted, setIncludeDeleted] = useState(false)
  const [search, setSearch] = useState("")
  const list = useTaxonomyList(path, includeDeleted)
  const scoped = isDeptScoped(path)
  const departments = useMyDepartments()
  const deptById = useMemo(
    () => new Map((departments.data ?? []).map((d) => [d.id, d.code])),
    [departments.data],
  )

  const [editing, setEditing] = useState<TaxonomyItem | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [deleting, setDeleting] = useState<TaxonomyItem | null>(null)

  const allItems = list.data?.items ?? []

  // Client-side search across code, name, and (for dept-scoped paths) the
  // resolved department code. Taxonomy lists are small enough that hitting
  // the server for filtering would be silly.
  const items = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return allItems
    return allItems.filter((it) => {
      if (it.code.toLowerCase().includes(q)) return true
      if (it.name.toLowerCase().includes(q)) return true
      if (scoped && it.department_id) {
        const dept = deptById.get(it.department_id) ?? ""
        if (dept.toLowerCase().includes(q)) return true
      }
      return false
    })
  }, [search, allItems, scoped, deptById])

  const openCreate = () => {
    setEditing(null)
    setSheetOpen(true)
  }

  const openEdit = (item: TaxonomyItem) => {
    setEditing(item)
    setSheetOpen(true)
  }

  const openDelete = (item: TaxonomyItem) => {
    setDeleting(item)
  }

  const total = list.data?.total ?? 0
  const colCount = scoped ? 5 : 4

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-[20px] font-semibold tracking-[-0.01em]">
            {title}
          </h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button onClick={openCreate}>New {singular.toLowerCase()}</Button>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${title.toLowerCase()}…`}
            className="pl-8"
            aria-label={`Search ${title.toLowerCase()}`}
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="show-deleted"
            checked={includeDeleted}
            onCheckedChange={setIncludeDeleted}
          />
          <Label htmlFor="show-deleted" className="text-sm">
            Show archived
          </Label>
        </div>
        <span className="ml-auto rounded-md border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {search.trim() ? items.length : total}
          </span>{" "}
          {(search.trim() ? items.length : total) === 1 ? "record" : "records"}
          {search.trim() && total !== items.length ? (
            <span className="text-muted-foreground"> of {total}</span>
          ) : null}
        </span>
      </div>

      {list.isError && (
        <Alert variant="destructive">
          <AlertTitle>Couldn't load {title.toLowerCase()}</AlertTitle>
          <AlertDescription>{list.error.detail}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[160px]">Code</TableHead>
              <TableHead>Name</TableHead>
              {scoped && (
                <TableHead className="w-[140px]">Department</TableHead>
              )}
              <TableHead className="w-[120px]">Status</TableHead>
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={colCount}
                  className="text-center text-sm text-muted-foreground"
                >
                  Loading…
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={colCount}
                  className="text-center text-sm text-muted-foreground"
                >
                  {search.trim()
                    ? `No ${title.toLowerCase()} match "${search.trim()}".`
                    : `No ${title.toLowerCase()} yet.`}
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id} style={DENSITY_ROW_STYLE}>
                  <TableCell style={DENSITY_CELL_STYLE}>
                    <span className="inline-flex items-center rounded-[5px] border bg-muted/40 px-1.5 py-0.5 font-mono text-[11.75px] text-foreground">
                      {item.code}
                    </span>
                  </TableCell>
                  <TableCell style={DENSITY_CELL_STYLE}>{item.name}</TableCell>
                  {scoped && (
                    <TableCell
                      className="text-xs text-muted-foreground"
                      style={DENSITY_CELL_STYLE}
                    >
                      {item.department_id
                        ? deptById.get(item.department_id) ?? "—"
                        : "—"}
                    </TableCell>
                  )}
                  <TableCell style={DENSITY_CELL_STYLE}>
                    {item.deleted_at ? (
                      <Badge tone="slate" dot>
                        Archived
                      </Badge>
                    ) : (
                      <Badge tone="emerald" dot>
                        Active
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell style={DENSITY_CELL_STYLE}>
                    {!item.deleted_at && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Actions for ${item.code}`}
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => openEdit(item)}>
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => openDelete(item)}
                            variant="destructive"
                          >
                            Archive
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <TaxonomySheet
        path={path}
        singular={singular}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        item={editing}
        onSuccess={() =>
          toast.success(
            editing
              ? `${singular} updated`
              : `${singular} created`,
          )
        }
      />
      <TaxonomyDeleteDialog
        path={path}
        singular={singular}
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        item={deleting}
        onDeleted={() => toast.success(`${singular} archived`)}
      />
    </div>
  )
}
