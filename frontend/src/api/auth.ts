export type User = {
  id: string
  email: string
  display_name: string
  roles: string[]
  // null == org admin (no filter). Otherwise the list of department UUIDs
  // this user can see; empty list = no department access.
  accessible_department_ids: string[] | null
}

export type LoginRequest = {
  email: string
  password: string
}

export class ApiError extends Error {
  status: number
  detail: string
  constructor(detail: string, status: number) {
    super(detail)
    this.status = status
    this.detail = detail
  }
}

async function jsonOrEmpty(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

function detailOf(body: unknown, fallback: string): string {
  if (
    body &&
    typeof body === "object" &&
    "detail" in body &&
    typeof (body as { detail: unknown }).detail === "string"
  ) {
    return (body as { detail: string }).detail
  }
  return fallback
}

export async function fetchMe(): Promise<User> {
  const res = await fetch("/api/auth/me", { credentials: "include" })
  if (!res.ok) {
    const body = await jsonOrEmpty(res)
    throw new ApiError(detailOf(body, "Not authenticated"), res.status)
  }
  return (await res.json()) as User
}

export async function loginRequest(req: LoginRequest): Promise<User> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  })
  const body = await jsonOrEmpty(res)
  if (!res.ok) {
    throw new ApiError(detailOf(body, "Login failed"), res.status)
  }
  return body as User
}

export type DepartmentBrief = {
  id: string
  code: string
  name: string
}

export async function fetchMyDepartments(): Promise<DepartmentBrief[]> {
  const res = await fetch("/api/auth/me/departments", { credentials: "include" })
  if (!res.ok) {
    const body = await jsonOrEmpty(res)
    throw new ApiError(detailOf(body, "Load failed"), res.status)
  }
  return (await res.json()) as DepartmentBrief[]
}

export async function fetchMyManageableDepartments(): Promise<
  DepartmentBrief[]
> {
  const res = await fetch("/api/auth/me/manageable-departments", {
    credentials: "include",
  })
  if (!res.ok) {
    const body = await jsonOrEmpty(res)
    throw new ApiError(detailOf(body, "Load failed"), res.status)
  }
  return (await res.json()) as DepartmentBrief[]
}

export async function logoutRequest(): Promise<void> {
  const res = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  })
  if (!res.ok && res.status !== 401) {
    const body = await jsonOrEmpty(res)
    throw new ApiError(detailOf(body, "Logout failed"), res.status)
  }
}
