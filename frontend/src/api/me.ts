import { useQuery } from "@tanstack/react-query"

import {
  ApiError,
  type DepartmentBrief,
  fetchMyDepartments,
  fetchMyManageableDepartments,
} from "@/api/auth"

const key = ["me", "departments"] as const
const manageableKey = ["me", "manageable-departments"] as const

// Phase 27.6 — the caller's still-open assignments across every project they
// can view, soonest due first. Powers the "My assignments" dashboard widget.
export type MyAssignment = {
  id: string
  project_id: string
  project_title: string
  milestone_id: string | null
  milestone_name: string | null
  assignee_user_id: string
  assignee_name: string
  assignee_email: string
  description: string
  status: string
  due_date: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type MyAssignmentList = { items: MyAssignment[]; total: number }

export function useMyAssignments() {
  return useQuery<MyAssignmentList, ApiError>({
    queryKey: ["me", "assignments"],
    queryFn: async () => {
      const res = await fetch("/api/me/assignments", {
        credentials: "include",
      })
      if (!res.ok) throw new ApiError("Couldn't load your assignments", res.status)
      return (await res.json()) as MyAssignmentList
    },
    staleTime: 30_000,
  })
}

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
