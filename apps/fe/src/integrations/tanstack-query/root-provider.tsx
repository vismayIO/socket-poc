import { AuthProvider } from '@/auth'
import { authClient, type AuthClient } from '@/lib/auth-client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

export function getContext() {
  const queryClient = new QueryClient()
  return {
    queryClient,
    authClient,
  }
}

export function Provider({
  children,
  queryClient,
}: {
  children: React.ReactNode
  queryClient: QueryClient
  authClient: AuthClient
}) {
  return (
    <AuthProvider authClient={authClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </AuthProvider>
  )
}
