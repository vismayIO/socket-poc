import { Auth } from './components/Auth'
import { NatsStatus } from './components/NatsStatus'
import './App.css'

function App() {
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

        <section className="nats-section">
          <h2>NATS Connection</h2>
          <NatsStatus />
        </section>
      </main>

      <footer className="app-footer">
        <p>Connect to NATS via WebSocket with secure token authentication</p>
      </footer>
    </div>
  )
}

export default App
