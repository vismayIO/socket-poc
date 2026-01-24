import { createAuthClient } from "better-auth/react";
import {
  inferAdditionalFields,
  usernameClient,
  multiSessionClient,
} from "better-auth/client/plugins";

// Better Auth client for the web frontend
export const authClient = createAuthClient({
  baseURL: "http://localhost:3000",
  plugins: [
    inferAdditionalFields<{
      user: {
        username?: string;
        displayUsername?: string;
      };
    }>(),
    usernameClient(),
    multiSessionClient(),
  ],
});

// Export hooks and utilities
export const {
  signIn,
  signUp,
  signOut,
  useSession,
  getSession,
} = authClient;
