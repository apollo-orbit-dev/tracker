import { useQuery } from '@tanstack/react-query'

export type HealthResponse = { status: string }

async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch('/api/health')
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`)
  }
  return response.json() as Promise<HealthResponse>
}

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 10_000,
  })
}
