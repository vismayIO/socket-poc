import { useState, useEffect, useCallback } from "react";
import {
  connectToNats,
  disconnectFromNats,
  isNatsConnected,
  getNatsConnection,
  type NatsConfig,
} from "../lib/nats-client";
import type { NatsConnection } from "nats.ws";

export interface UseNatsResult {
  connection: NatsConnection | null;
  isConnected: boolean;
  error: string | null;
  connect: (token: string) => Promise<void>;
  disconnect: () => Promise<void>;
}

const NATS_WS_URL = "ws://localhost:8080";

export function useNats(): UseNatsResult {
  const [connection, setConnection] = useState<NatsConnection | null>(getNatsConnection());
  const [isConnected, setIsConnected] = useState(isNatsConnected());
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async (token: string) => {
    setError(null);
    try {
      const config: NatsConfig = {
        wsUrl: NATS_WS_URL,
        token,
      };
      const nc = await connectToNats(config);
      setConnection(nc);
      setIsConnected(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to connect";
      setError(message);
      setIsConnected(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    await disconnectFromNats();
    setConnection(null);
    setIsConnected(false);
    setError(null);
  }, []);

  // Monitor connection state
  useEffect(() => {
    if (connection) {
      connection.closed().then(() => {
        setIsConnected(false);
        setConnection(null);
      });
    }
  }, [connection]);

  return {
    connection,
    isConnected,
    error,
    connect,
    disconnect,
  };
}
