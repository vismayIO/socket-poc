import { connect, StringCodec, type NatsConnection } from "nats";
import { serve } from "bun";
import { registerUser, authenticateUser, formatCredentialsFile } from "./auth";

const NATS_URL = process.env.NATS_URL || "nats://localhost:4222";
const PORT = parseInt(process.env.PORT || "3001");

// Trading data structure
interface TradingData {
  timestamp: number;
  price: number;
  volume: number;
  symbol: string;
}

let natsConnection: NatsConnection | null = null;
const sc = StringCodec();

// Initialize NATS connection
async function initNATS() {
  try {
    console.log(`Connecting to NATS at ${NATS_URL}...`);
    natsConnection = await connect({ servers: NATS_URL });
    console.log("✅ Connected to NATS");
    
    natsConnection.closed().then(() => {
      console.log("NATS connection closed");
    });
  } catch (error) {
    console.error("Failed to connect to NATS:", error);
    console.log("💡 Make sure NATS server is running. You can start it with: nats-server");
    process.exit(1);
  }
}

// Publish trading data to NATS
async function publishTradingData(data: TradingData) {
  if (!natsConnection) return;
  
  try {
    const subject = "trading.data";
    const payload = sc.encode(JSON.stringify(data));
    natsConnection.publish(subject, payload);
  } catch (error) {
    console.error("Error publishing to NATS:", error);
  }
}

// Generate realistic trading data
let basePrice = 100.0;
const symbol = "BTC/USD";

function generateTradingData(): TradingData {
  // Simulate price movement with random walk
  const change = (Math.random() - 0.5) * 2; // -1 to +1
  basePrice = Math.max(50, Math.min(200, basePrice + change));
  
  return {
    timestamp: Date.now(),
    price: Math.round(basePrice * 100) / 100,
    volume: Math.floor(Math.random() * 1000) + 100,
    symbol,
  };
}

// Start publishing trading data
async function startTradingFeed() {
  setInterval(() => {
    const data = generateTradingData();
    publishTradingData(data);
  }, 5000); // Publish every second
}

// HTTP Server for authentication endpoints
function startHTTPServer() {
  serve({
    port: PORT,
    async fetch(req) {
      const url = new URL(req.url);
      
      // CORS headers
      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      };

      // Handle OPTIONS for CORS
      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
      }

      // Register endpoint
      if (url.pathname === "/api/auth/register" && req.method === "POST") {
        try {
          const body = await req.json();
          const { username, password } = body as { username: string; password: string };

          if (!username || !password) {
            return Response.json(
              { error: "Username and password are required" },
              { status: 400, headers: corsHeaders }
            );
          }

          const credentials = await registerUser(username, password);
          const credsFile = formatCredentialsFile(credentials.jwt, credentials.nkeySeed.toBase64());

          return Response.json(
            {
              success: true,
              userId: credentials.userId,
              jwt: credentials.jwt,
              nkeySeed: credentials.nkeySeed,
              nkeyPublic: credentials.nkeyPublic,
              credsFile, // Formatted credentials file
            },
            { headers: corsHeaders }
          );
        } catch (error: any) {
          return Response.json(
            { error: error.message || "Registration failed" },
            { status: 400, headers: corsHeaders }
          );
        }
      }

      // Login endpoint
      if (url.pathname === "/api/auth/login" && req.method === "POST") {
        try {
          const body = await req.json();
          const { username, password } = body as { username: string; password: string };

          if (!username || !password) {
            return Response.json(
              { error: "Username and password are required" },
              { status: 400, headers: corsHeaders }
            );
          }

          const credentials = await authenticateUser(username, password);

          if (!credentials) {
            return Response.json(
              { error: "Invalid username or password" },
              { status: 401, headers: corsHeaders }
            );
          }

          const credsFile = formatCredentialsFile(credentials.jwt, credentials.nkeySeed.toBase64());

          return Response.json(
            {
              success: true,
              userId: credentials.userId,
              jwt: credentials.jwt,
              nkeySeed: credentials.nkeySeed,
              nkeyPublic: credentials.nkeyPublic,
              credsFile, // Formatted credentials file
            },
            { headers: corsHeaders }
          );
        } catch (error: any) {
          return Response.json(
            { error: error.message || "Authentication failed" },
            { status: 500, headers: corsHeaders }
          );
        }
      }

      // Health check
      if (url.pathname === "/health" && req.method === "GET") {
        return Response.json(
          { status: "ok", natsConnected: natsConnection !== null },
          { headers: corsHeaders }
        );
      }

      // Manual trigger endpoint
      if (url.pathname === "/api/trigger" && req.method === "POST") {
        const data = generateTradingData();
        await publishTradingData(data);
        return Response.json(
          { success: true, data },
          { headers: corsHeaders }
        );
      }

      return Response.json(
        { error: "Not found" },
        { status: 404, headers: corsHeaders }
      );
    },
  });

  console.log(`🌐 HTTP server running on http://localhost:${PORT}`);
}

// Initialize and start
async function start() {
  await initNATS();
  startTradingFeed();
  startHTTPServer();
  console.log(`📈 Trading data feed started for ${symbol}`);
}

start().catch(console.error);
