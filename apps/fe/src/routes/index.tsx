import { createFileRoute, Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import logo from '../logo.svg'
import { authClient } from '@/lib/auth-client'

export const Route = createFileRoute('/')({
  component: App,
})

function App() {
  const { data } = authClient.useSession()

  if (data) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center mb-8">
          <img
            src={logo}
            className="h-32 mx-auto mb-4 animate-[spin_20s_linear_infinite]"
            alt="logo"
          />
          <h1 className="text-4xl font-bold mb-2">Welcome back, {data?.user?.name || data?.user?.email}!</h1>
          <p className="text-muted-foreground">You're successfully authenticated.</p>
        </div>

        <div className="flex justify-center">
          <Link to="/dashboard">
            <Button size="lg">
              Go to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-900 via-gray-800 to-gray-900">
      <div className="container mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <img
            src={logo}
            className="h-32 mx-auto mb-8 animate-[spin_20s_linear_infinite]"
            alt="logo"
          />
          <h1 className="text-5xl font-bold text-white mb-4">
            Welcome to TanStack App
          </h1>
          <p className="text-xl text-gray-300 mb-8">
            A modern React application with authentication powered by Better Auth and TanStack Router
          </p>

          <div className="flex justify-center gap-4 mb-12">
            <Button size="lg" variant="outline">
              <Link to="/login">
                Login
              </Link>
            </Button>
            <Link to="/sign-up">
              <Button size="lg" className="bg-cyan-600 hover:bg-cyan-700">
                Get Started
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <Card className="bg-gray-800 border-gray-700 text-white">
            <CardHeader>
              <CardTitle className="text-cyan-400">🔐 Secure Authentication</CardTitle>
              <CardDescription className="text-gray-300">
                Powered by Better Auth with email/password authentication
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-400">
                Industry-standard security with session management and protected routes.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gray-800 border-gray-700 text-white">
            <CardHeader>
              <CardTitle className="text-cyan-400">🚀 TanStack Router</CardTitle>
              <CardDescription className="text-gray-300">
                Type-safe routing with automatic code splitting
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-400">
                File-based routing with built-in authentication guards and redirects.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gray-800 border-gray-700 text-white">
            <CardHeader>
              <CardTitle className="text-cyan-400">🎨 Modern UI</CardTitle>
              <CardDescription className="text-gray-300">
                Beautiful components with Tailwind CSS and Radix UI
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-400">
                Responsive design with dark theme and smooth animations.
              </p>
            </CardContent>
          </Card>
        </div>
      </div >
    </div >
  )
}
