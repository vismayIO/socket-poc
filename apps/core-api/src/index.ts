import { Elysia } from "elysia";
import { auth } from "../auth";
import { startAuthCalloutService } from "../lib/nats-auth-callout";
import { cors } from "@elysiajs/cors";

// Start the auth callout service
startAuthCalloutService().catch((error) => {
  console.error("Failed to start auth callout service:", error);
  console.log("Note: Make sure NATS is running and NATS_ISSUER_SEED is set");
});

const app = new Elysia().use(cors()).mount(auth.handler).listen(3000);

app
  .get("/api/nats/info", () => {
    // Return NATS connection info for clients
    return {
      wsUrl: process.env.NATS_WS_URL || "ws://localhost:8080",
      // Connection instructions
      instructions:
        "Use your Better Auth bearer token as the password when connecting",
    };
  })
  .listen(3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
);
