import { Auth } from "./components/Auth";
import { NatsStatus } from "./components/NatsStatus";
import { DuckDBStatus } from "./components/DuckDBStatus";
import { AnalyticsDashboard } from "./components/AnalyticsDashboard";
import { DataSyncDashboard } from "./components/DataSyncDashboard";
import { TradingDashboard } from "./components/TradingDashboard";
import { useSession } from "./lib/auth-client";
import "./App.css";

function App() {
  const { data: session, isPending } = useSession();
  const isLoggedIn = session?.user != null;

  return (
    <div className="app">
      <header className="app-header">
        <h1>🚀 Socket POC</h1>
        <p>NATS + Better Auth Integration Demo</p>
      </header>

      <main className="app-main">
        <section className="auth-section">
          <h2>Authentication</h2>
          <Auth />
        </section>

        {/* Show login prompt for unauthenticated users */}
        {!isLoggedIn && !isPending && (
          <section className="login-prompt-section">
            <div className="login-prompt">
              <h3>🔐 Authentication Required</h3>
              <p>Please sign in above to access the dashboard and real-time data.</p>
            </div>
          </section>
        )}

        {/* Loading state */}
        {isPending && (
          <section className="loading-section">
            <div className="loading-message">⏳ Checking authentication...</div>
          </section>
        )}

        {/* Dashboard components - only shown when logged in */}
        {isLoggedIn && (
          <>
            <section className="nats-section">
              <h2>NATS Connection</h2>
              <NatsStatus />
            </section>

            <section className="duckdb-section">
              <h2>DuckDB Analytics</h2>
              <DuckDBStatus />
            </section>

            <section className="trading-section">
              <h2>Trading Dashboard</h2>
              <TradingDashboard />
            </section>

            <section className="data-sync-section">
              <h2>Data Synchronization</h2>
              <DataSyncDashboard />
            </section>

            <section className="analytics-section">
              <h2>Real-time Analytics</h2>
              <AnalyticsDashboard />
            </section>
          </>
        )}
      </main>

      <footer className="app-footer">
        <p>Connect to NATS via WebSocket with secure token authentication</p>
      </footer>
    </div>
  );
}

export default App;

