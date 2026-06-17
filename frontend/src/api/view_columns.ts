import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { ApiError } from "@/api/auth"

export type ViewColumnsPrefs = {
  columns: string[]
  sort_key: string | null
  sort_direction: "asc" | "desc" | null
}

const key = (templateId: string) => ["view-columns", templateId] as const

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
  if (body && typeof body === "object" && "detail" in body) {
    const d = (body as { detail: unknown }).detail
    if (typeof d === "string") return d
    if (Array.isArray(d)) return d.map((x) => String(x)).join("; ") || fallback
  }
  return fallback
}

async function apiCall<T>(
  url: string,
  init: RequestInit,
  fallback: string,
): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...init })
  if (res.status === 204) return undefined as T
  const body = await jsonOrEmpty(res)
  if (!res.ok) throw new ApiError(detailOf(body, fallback), res.status)
  return body as T
}

/**
 * Loads saved prefs for (current user, templateId). Returns null (not
 * undefined) when the server says 404 — caller interprets null as
 * "use defaults".
 */
export function useViewColumns(templateId: string | undefined) {
  return useQuery<ViewColumnsPrefs | null, ApiError>({
    queryKey: key(templateId ?? ""),
    queryFn: async () => {
      const res = await fetch(
        `/api/projects/view/${templateId}/columns`,
        { credentials: "include" },
      )
      if (res.status === 404) return null
      const body = await jsonOrEmpty(res)
      if (!res.ok) {
        throw new ApiError(detailOf(body, "Load failed"), res.status)
      }
      return body as ViewColumnsPrefs
    },
    enabled: !!templateId,
  })
}

export function useViewColumnsSave(templateId: string) {
  const qc = useQueryClient()
  return useMutation<
    ViewColumnsPrefs,
    ApiError,
    ViewColumnsPrefs,
    { previous: ViewColumnsPrefs | null | undefined }
  >({
    mutationFn: (body) =>
      apiCall<ViewColumnsPrefs>(
        `/api/projects/view/${templateId}/columns`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        "Save failed",
      ),
    // Optimistic update: flip the cache before the network round-trip so
    // the picker reflects the change instantly. Rolled back onError.
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: key(templateId) })
      const previous = qc.getQueryData<ViewColumnsPrefs | null>(
        key(templateId),
      )
      qc.setQueryData<ViewColumnsPrefs>(key(templateId), next)
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx) qc.setQueryData(key(templateId), ctx.previous)
    },
    onSuccess: (data) => {
      qc.setQueryData(key(templateId), data)
    },
  })
}

export function useViewColumnsReset(templateId: string) {
  const qc = useQueryClient()
  return useMutation<void, ApiError, void>({
    mutationFn: () =>
      apiCall<void>(
        `/api/projects/view/${templateId}/columns`,
        { method: "DELETE" },
        "Reset failed",
      ),
    onSuccess: () => {
      qc.setQueryData(key(templateId), null)
    },
  })
}
