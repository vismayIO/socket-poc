import { connect, StringCodec, type NatsConnection } from "nats";

const NATS_URL = process.env.NATS_URL || "nats://localhost:4222";

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

// Initialize and start
async function start() {
  await initNATS();
  startTradingFeed();
  console.log(`📈 Trading data feed started for ${symbol}`);
}

start().catch(console.error);
