import { createAuthClient } from "better-auth/client";
import {
    inferAdditionalFields,
    usernameClient,
    anonymousClient,
    multiSessionClient,
    organizationClient,
    adminClient,
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
