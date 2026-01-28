import { type AuthClient } from '@/lib/auth-client';
import * as React from 'react';

const AuthContext = React.createContext<ReturnType<AuthClient['useSession']> | null>(null)

export function AuthProvider({ children, authClient }: { children: React.ReactNode; authClient: AuthClient }) {
    const session = authClient.useSession()

    if (session.error) {
        authClient.signOut()
    }

    return (
        <AuthContext.Provider value={session}>
            {children}
        </AuthContext.Provider>
    )
}