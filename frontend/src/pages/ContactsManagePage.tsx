import { MoreHorizontal, Search } from "lucide-react"
import { type CSSProperties, useMemo, useState } from "react"
import { toast } from "sonner"

import { Avatar } from "@/components/Avatar"
import { ContactDeleteDialog } from "@/components/ContactDeleteDialog"
import { ContactSheet } from "@/components/ContactSheet"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useTopbarCrumbs } from "@/hooks/useTopbarCrumbs"
import { type Contact, useContactList } from "@/api/contacts"
import { useMyDepartments } from "@/api/me"

const DENSITY_ROW_STYLE: CSSProperties = {
  height: "var(--row-h)",
  fontSize: "var(--fs-table)",
}
const DENSITY_CELL_STYLE: CSSProperties = {
  paddingTop: "var(--row-py)",
  paddingBottom: "var(--row-py)",
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-[5px] border bg-muted/40 px-1.5 py-0.5 font-mono text-[11.75px] text-foreground">
      {children}
    </span>
  )
}

export function ContactsManagePage() {
  useTopbarCrumbs(
    useMemo(() => [{ label: "Admin" }, { label: "Contacts" }], []),
  )

  const list = useContactList()
  const departments = useMyDepartments()
  const deptById = useMemo(
    () => new Map((departments.data ?? []).map((d) => [d.id, d.code])),
    [departments.data],
  )

  const [search, setSearch] = useState("")
  const [editing, setEditing] = useState<Contact | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [deleting, setDeleting] = useState<Contact | null>(null)

  const allItems = list.data?.items ?? []

  // Client-side filter across the columns the user can see. Search
  // hits name + email + phone + organization + the resolved dept code,
  // matching the table's visible content.
  const items = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return allItems
    return allItems.filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true
      if (c.email && c.email.toLowerCase().includes(q)) return true
      if (c.phone && c.phone.toLowerCase().includes(q)) return true
      if (c.organization && c.organization.toLowerCase().includes(q)) return true
      const deptCode = deptById.get(c.department_id) ?? ""
      if (deptCode.toLowerCase().includes(q)) return true
      return false
    })
  }, [search, allItems, deptById])

  const total = list.data?.total ?? 0

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-[20px] font-semibold tracking-[-0.01em]">
            Contacts
          </h1>
          <p className="text-sm text-muted-foreground">
            Reusable point-of-contact records. Used across projects via the
            project-contact link.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null)
            setSheetOpen(true)
          }}
        >
          New contact
        </Button>
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
            placeholder="Search name, email, phone, organization…"
            className="pl-8"
            aria-label="Search contacts"
          />
        </div>
        <span className="ml-auto rounded-md border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {search.trim() ? items.length : total}
          </span>{" "}
          {(search.trim() ? items.length : total) === 1
            ? "contact"
            : "contacts"}
          {search.trim() && total !== items.length ? (
            <span className="text-muted-foreground"> of {total}</span>
          ) : null}
        </span>
      </div>

      {list.isError && (
        <Alert variant="destructive">
          <AlertTitle>Couldn't load contacts</AlertTitle>
          <AlertDescription>{list.error.detail}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contact</TableHead>
              <TableHead className="w-[120px]">Department</TableHead>
              <TableHead className="w-[220px]">Email</TableHead>
              <TableHead className="w-[160px]">Phone</TableHead>
              <TableHead>Organization</TableHead>
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-sm text-muted-foreground"
                >
                  Loading…
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-sm text-muted-foreground"
                >
                  {search.trim()
                    ? `No contacts match "${search.trim()}".`
                    : "No contacts yet."}
                </TableCell>
              </TableRow>
            ) : (
              items.map((c) => {
                const deptCode = deptById.get(c.department_id)
                return (
                  <TableRow key={c.id} style={DENSITY_ROW_STYLE}>
                    <TableCell style={DENSITY_CELL_STYLE}>
                      <span className="flex items-center gap-2">
                        <Avatar name={c.name} size={22} />
                        <span className="font-medium">{c.name}</span>
                      </span>
                    </TableCell>
                    <TableCell style={DENSITY_CELL_STYLE}>
                      {deptCode ? (
                        <Chip>{deptCode}</Chip>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell
                      className="font-mono text-xs text-muted-foreground"
                      style={DENSITY_CELL_STYLE}
                    >
                      {c.email ? (
                        <a
                          href={`mailto:${c.email}`}
                          className="hover:text-foreground hover:underline"
                        >
                          {c.email}
                        </a>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell
                      className="font-mono text-xs text-muted-foreground"
                      style={DENSITY_CELL_STYLE}
                    >
                      {c.phone ? (
                        <a
                          href={`tel:${c.phone}`}
                          className="hover:text-foreground hover:underline"
                        >
                          {c.phone}
                        </a>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell
                      className="text-xs text-muted-foreground"
                      style={DENSITY_CELL_STYLE}
                    >
                      {c.organization ?? "—"}
                    </TableCell>
                    <TableCell style={DENSITY_CELL_STYLE}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Actions for ${c.name}`}
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => {
                              setEditing(c)
                              setSheetOpen(true)
                            }}
                          >
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => setDeleting(c)}
                          >
                            Archive
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <ContactSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        item={editing}
        onSuccess={() =>
          toast.success(editing ? "Contact updated" : "Contact created")
        }
      />
      <ContactDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        item={deleting}
        onDeleted={() => toast.success("Contact archived")}
      />
    </div>
  )
}
