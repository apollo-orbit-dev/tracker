import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router"

import {
  ApiError,
  type LoginRequest,
  type User,
  fetchMe,
  loginRequest,
  logoutRequest,
} from "@/api/auth"

const ME_KEY = ["auth", "me"] as const

export function useAuth() {
  return useQuery<User, ApiError>({
    queryKey: ME_KEY,
    queryFn: fetchMe,
    retry: false,
    staleTime: 5 * 60_000,
  })
}

export function useLogin() {
  const qc = useQueryClient()
  return useMutation<User, ApiError, LoginRequest>({
    mutationFn: loginRequest,
    onSuccess: (user) => {
      qc.setQueryData(ME_KEY, user)
    },
  })
}

export function useLogout() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  return useMutation<void, ApiError, void>({
    mutationFn: logoutRequest,
    onSuccess: () => {
      qc.setQueryData(ME_KEY, null)
      qc.removeQueries()
      navigate("/login", { replace: true })
    },
  })
}
