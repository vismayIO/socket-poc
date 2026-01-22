# NATS Real-time POC Backend

A Proof of Concept demonstrating real-time data updates using NATS messaging system with Bun runtime.

## Prerequisites

- [Bun](https://bun.sh) installed
- NATS server running (see setup below)

## Setup

### 1. Install Dependencies

```bash
bun install
```

### 2. Start NATS Server with WebSocket Support

You can run NATS server with WebSocket enabled using Docker:

```bash
docker run -d --name nats-server \
  -p 4222:4222 \
  -p 8222:8222 \
  -p 8080:8080 \
  nats:latest -ws 8080
```

Or install NATS server locally:

```bash
# macOS
brew install nats-server

# Linux
curl -L https://github.com/nats-io/nats-server/releases/download/v2.10.0/nats-server-v2.10.0-linux-amd64.zip -o nats-server.zip
unzip nats-server.zip
sudo mv nats-server-v2.10.0-linux-amd64/nats-server /usr/local/bin/

# Start server with WebSocket support
nats-server -ws 8080
```

**Note**: The `-ws 8080` flag enables WebSocket support on port 8080, which is required for the frontend to connect directly to NATS.

### 3. Configure Connection (Optional)

By default, the backend connects to `nats://localhost:4222`. To use a different server:

```bash
export NATS_URL=nats://your-server:4222
```

## Running the Backend

```bash
# Development mode with hot reload
bun run dev

# Production mode
bun run start
```

The backend will:
- Connect to NATS server (standard TCP on port 4222)
- Start publishing data updates every 2 seconds to `data.updates` subject
- Provide health check at `http://localhost:3001/health`
- Provide manual trigger endpoint at `POST http://localhost:3001/api/trigger`

**Note**: The frontend connects directly to NATS via WebSocket (port 8080), so no WebSocket bridge is needed in the backend.

## API Endpoints

- `GET /health` - Health check endpoint
- `POST /api/trigger` - Manually trigger a data update
- `WS /ws` - WebSocket endpoint for real-time updates

## Project Structure

```
be/
├── index.ts          # Main server code with NATS integration
├── package.json      # Dependencies and project config
├── tsconfig.json     # TypeScript configuration
└── README.md         # This file
```

## Learn More

- [NATS Documentation](https://docs.nats.io/)
- [Bun Documentation](https://bun.sh/docs)
- [NATS Client for Node.js/Bun](https://github.com/nats-io/nats.js)
