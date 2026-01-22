# NATS Real-time POC

A Proof of Concept demonstrating real-time data updates using NATS messaging system with direct NATS WebSocket client on the frontend.

## Architecture

- **Backend (Bun)**: Connects to NATS and publishes data updates to NATS subjects
- **Frontend (React)**: Connects directly to NATS server using `nats.ws` WebSocket client and subscribes to updates

## Prerequisites

- [Bun](https://bun.sh) installed
- NATS server with WebSocket support enabled (see setup below)

## Quick Start

### 1. Start NATS Server with WebSocket Support

```bash
# Using Docker (recommended)
docker run -d --name nats-server -v ./:/container   -p 4222:4222   -p 8222:8222   -p 8080:8080   nats:latest -c /container/nats.conf

# Or install locally and run with WebSocket
nats-server -ws 8080
```

**Important**: The `-ws 8080` flag enables WebSocket support on port 8080, which is required for browser clients.

### 2. Start Backend

```bash
cd be
bun install
bun run dev
```

The backend will:
- Connect to NATS server at `nats://localhost:4222`
- Publish data updates every 2 seconds to `data.updates` subject
- Run on `http://localhost:3001` (for manual trigger endpoint)

### 3. Start Frontend

```bash
cd fe
bun install
bun run dev
```

The frontend will:
- Connect directly to NATS server via WebSocket at `ws://localhost:8080`
- Subscribe to `data.updates` subject
- Display real-time updates in the UI

## How It Works

1. **Backend** connects to NATS server (standard TCP connection on port 4222)
2. **Backend** publishes data updates every 2 seconds to NATS subject `data.updates`
3. **Frontend** connects directly to NATS server using WebSocket (port 8080) via `nats.ws` client
4. **Frontend** subscribes to `data.updates` subject and receives messages in real-time
5. **Frontend** displays updates in a live feed

## Features

- ✅ Real-time data updates via NATS
- ✅ Direct NATS WebSocket client on frontend (no proxy needed)
- ✅ Automatic reconnection on disconnect
- ✅ Manual trigger endpoint for testing
- ✅ Health check endpoint
- ✅ Modern React UI with Tailwind CSS

## Project Structure

```
socket-poc/
├── be/                 # Backend (Bun + NATS)
│   ├── index.ts        # Main server code - publishes to NATS
│   └── package.json
├── fe/                 # Frontend (React + nats.ws)
│   ├── src/
│   │   ├── App.tsx
│   │   └── components/
│   │       └── RealtimeData.tsx  # NATS WebSocket client
│   └── package.json
└── README.md
```

## Environment Variables

### Backend

- `NATS_URL` - NATS server URL (default: `nats://localhost:4222`)
- `PORT` - Backend server port (default: `3001`)

### Frontend

- `VITE_NATS_URL` - NATS WebSocket URL (default: `ws://localhost:8080`)
- `VITE_BACKEND_URL` - Backend API URL for manual trigger (default: `http://localhost:3001`)

## Ports

- **4222**: NATS standard TCP port (backend connection)
- **8080**: NATS WebSocket port (frontend connection)
- **8222**: NATS monitoring port (optional)
- **3001**: Backend HTTP server (for manual trigger endpoint)

## Learn More

- [NATS Documentation](https://docs.nats.io/)
- [NATS WebSocket](https://docs.nats.io/using-nats/developer/connecting/websocket)
- [Bun Documentation](https://bun.sh/docs)
- [React Documentation](https://react.dev/)
