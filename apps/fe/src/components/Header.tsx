import { Link, useNavigate } from '@tanstack/react-router'
import { Button } from './ui/button'

import { useState } from 'react'
import { ClipboardType, Home, Menu, Network, Table, X, User, LogOut, Shield } from 'lucide-react'
import { authClient } from '@/lib/auth-client'

export default function Header() {
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const { data } = authClient.useSession()

  return (
    <>
      <header className="p-4 flex items-center justify-between bg-gray-800 text-white shadow-lg">
        <div className="flex items-center">
          <button
            onClick={() => setIsOpen(true)}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
            aria-label="Open menu"
          >
            <Menu size={24} />
          </button>
          <h1 className="ml-4 text-xl font-semibold">
            <Link to="/">
              <p>Trading</p>
            </Link>
          </h1>
        </div>

        <div className="flex items-center gap-4">
          {data ? (
            <>
              <div className="flex items-center gap-2">
                <User size={20} />
                <span className="text-sm">{data?.user?.name || data?.user?.email}</span>
              </div>
              <Button
                onClick={async () => await authClient.signOut({ fetchOptions: { onSuccess: () => navigate({ to: '/' }) } })}
                variant="outline"
                size="sm"
                className="text-white border-white hover:bg-white hover:text-gray-800"
              >
                <LogOut size={16} className="mr-2" />
                Logout
              </Button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link to="/login">
                <Button size="sm" className="bg-cyan-600 hover:bg-cyan-700">
                  Login
                </Button>
              </Link>
              <Link to="/sign-up">
                <Button size="sm" className="bg-cyan-600 hover:bg-cyan-700">
                  Sign Up
                </Button>
              </Link>
            </div>
          )}
        </div>
      </header>

      <aside
        className={`fixed top-0 left-0 h-full w-80 bg-gray-900 text-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${isOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold">Navigation</h2>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            aria-label="Close menu"
          >
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 p-4 overflow-y-auto">
          <Link
            to="/"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
            activeProps={{
              className:
                'flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-2',
            }}
          >
            <Home size={20} />
            <span className="font-medium">Home</span>
          </Link>

          {/* Protected Routes */}
          {data && (
            <Link
              to="/dashboard"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
              activeProps={{
                className:
                  'flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-2',
              }}
            >
              <Shield size={20} />
              <span className="font-medium">Dashboard</span>
            </Link>
          )}

          {/* Demo Links Start */}
          <div className="mt-4 pt-4 border-t border-gray-700">
            <h3 className="text-sm font-semibold text-gray-400 mb-2">Demo Pages</h3>

            <Link
              to="/demo/tanstack-query"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
              activeProps={{
                className:
                  'flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-2',
              }}
            >
              <Network size={20} />
              <span className="font-medium">TanStack Query</span>
            </Link>

            <Link
              to="/demo/table"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
              activeProps={{
                className:
                  'flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-2',
              }}
            >
              <Table size={20} />
              <span className="font-medium">TanStack Table</span>
            </Link>

            <Link
              to="/demo/form/simple"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
              activeProps={{
                className:
                  'flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-2',
              }}
            >
              <ClipboardType size={20} />
              <span className="font-medium">Simple Form</span>
            </Link>

            <Link
              to="/demo/form/address"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
              activeProps={{
                className:
                  'flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-2',
              }}
            >
              <ClipboardType size={20} />
              <span className="font-medium">Address Form</span>
            </Link>
          </div>
          {/* Demo Links End */}
        </nav>
      </aside>
    </>
  )
}
