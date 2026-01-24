import { Pool } from "pg";
import { username, bearer, jwt, multiSession } from "better-auth/plugins";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./lib/prisma";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  appName: "core-api",
  plugins: [multiSession(), jwt(), bearer(), username()],
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  trustedOrigins: [
    process.env.BETTER_AUTH_TRUSTED_ORIGINS || "http://localhost:5173",
  ],
  emailAndPassword: {
    enabled: true,
  },
});
