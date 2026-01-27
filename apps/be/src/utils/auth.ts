import { prismaAdapter } from "better-auth/adapters/prisma";
import {
    username,
    anonymous,
    jwt,
    multiSession,
    bearer,
    organization,
    admin,
} from "better-auth/plugins";
import { betterAuth } from "better-auth";
import { prisma } from "./prisma";


export const auth = betterAuth({
    database: prismaAdapter(prisma, {
        provider: "postgresql",
    }),
    appName: "@socket-poc/be",
    plugins: [
        admin(),
        organization(),
        bearer(),
        multiSession(),
        jwt(),
        anonymous(),
        username(),
    ],
});
