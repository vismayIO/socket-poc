import { createAuthClient } from "better-auth/client";
import type { auth } from "./auth.js";
import {
    inferAdditionalFields,
    usernameClient,
    anonymousClient,
    multiSessionClient,
    organizationClient,
    adminClient,
} from "better-auth/client/plugins";

export const authClient = createAuthClient({
    baseURL: "http://localhost:3000",
    plugins: [
        inferAdditionalFields<typeof auth>(),
        usernameClient(),
        anonymousClient(),
        multiSessionClient(),
        organizationClient(),
        adminClient(),
    ],
});
