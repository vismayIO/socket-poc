import { createAuthClient } from "better-auth/react";
import {
    adminClient,
    anonymousClient,
    inferAdditionalFields,
    multiSessionClient,
    organizationClient,
    usernameClient,
} from "better-auth/client/plugins";

export const authClient = createAuthClient({
    baseURL: "http://localhost:3001",
    plugins: [
        inferAdditionalFields(),
        usernameClient(),
        anonymousClient(),
        multiSessionClient(),
        organizationClient(),
        adminClient(),
    ],
});
export type AuthClient = typeof authClient;