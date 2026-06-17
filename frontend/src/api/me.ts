import { useQuery } from "@tanstack/react-query"

import {
  ApiError,
  type DepartmentBrief,
  fetchMyDepartments,
  fetchMyManageableDepartments,
} from "@/api/auth"

const key = ["me", "departments"] as const
const manageableKey = ["me", "manageable-departments"] as const

export function useMyDepartments() {
  return useQuery<DepartmentBrief[], ApiError>({
    queryKey: key,
    queryFn: fetchMyDepartments,
    staleTime: 60_000,
  })
}

// Phase 7.16 — departments the caller can publish a custom view to
// (DM+/admin). Powers the ViewPage Share menu.
export function useManageableDepartments(enabled = true) {
  // Only owners need this (it powers the Share menu). Pass enabled=false
  // for readers so a non-DM's page load doesn't fire a request that
  // always returns [].
  return useQuery<DepartmentBrief[], ApiError>({
    queryKey: manageableKey,
    queryFn: fetchMyManageableDepartments,
    staleTime: 60_000,
    enabled,
  })
}
