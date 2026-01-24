import { useState, useEffect } from "react";
import { useSession, getSession } from "../lib/auth-client";
import { useNats } from "../hooks/useNats";
import "./NatsStatus.css";

export function NatsStatus() {
  const { data: session } = useSession();
  const { isConnected, error, connect, disconnect } = useNats();
  const [connecting, setConnecting] = useState(false);

  // Auto-connect when user is authenticated
  useEffect(() => {
    if (session?.session?.token && !isConnected && !connecting) {
      handleConnect();
    }
  }, [session?.session?.token, isConnected]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      // Get fresh session token
      const currentSession = await getSession();
      if (currentSession.data?.session?.token) {
        await connect(currentSession.data.session.token);
      }
    } catch (err) {
      console.error("Failed to connect:", err);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    await disconnect();
  };

  if (!session) {
    return (
      <div className="nats-status disconnected">
        <div className="status-indicator"></div>
        <span>Sign in to connect to NATS</span>
      </div>
    );
  }

  return (
    <div className={`nats-status ${isConnected ? "connected" : "disconnected"}`}>
      <div className="status-header">
        <div className="status-indicator"></div>
        <span className="status-text">
          NATS: {isConnected ? "Connected" : connecting ? "Connecting..." : "Disconnected"}
        </span>
      </div>

      {error && (
        <div className="error-badge">
          {error}
        </div>
      )}

      <div className="actions">
        {!isConnected ? (
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="connect-btn"
          >
            {connecting ? "Connecting..." : "Connect"}
          </button>
        ) : (
          <button onClick={handleDisconnect} className="disconnect-btn">
            Disconnect
          </button>
        )}
      </div>

      {isConnected && (
        <div className="connected-info">
          <p>✅ WebSocket connection active</p>
          <p>🔐 Authenticated as: {session.user.name}</p>
        </div>
      )}
    </div>
  );
}
